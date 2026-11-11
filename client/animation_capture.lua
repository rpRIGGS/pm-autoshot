-- PM AutoShot animation capture prototype. Standalone test command.
-- The production batch pipeline will reuse the existing AutoShot studio camera.
local active = false
local capturing = false
local studioResult = nil
RegisterNetEvent('pm-autoshot:client:studioResult', function(ok, reason)
    studioResult = { ok = ok, reason = reason }
end)
local pending = {}
local uploadSequence = 0
local finishResults = {}
local lastCaptureResult = nil
RegisterNetEvent('pm-autoshot:client:animationFinished', function(id, ok, detail)
    if finishResults[id] then finishResults[id] = { done = true, ok = ok, detail = detail } end
end)

RegisterNetEvent('pm-autoshot:client:frameSaved', function(id, ok, detail)
    if pending[id] then pending[id] = { done = true, ok = ok, detail = detail } end
end)

-- Keep screenshot timing independent of server upload acknowledgements.
local function screenshotFrame()
    local done, image = false, nil
    exports['screenshot-basic']:requestScreenshot({ encoding = 'png' }, function(data)
        image = data
        done = true
    end)
    local deadline = GetGameTimer() + 12000
    while not done and active and GetGameTimer() < deadline do Wait(10) end
    if not active or not done or type(image) ~= 'string' or image == '' then
        return nil, 'screenshot timed out'
    end
    return image
end

local function uploadFrame(name, frameIndex, interval, image)
    uploadSequence = uploadSequence + 1
    local id = uploadSequence
    pending[id] = { done = false }
    TriggerLatentServerEvent('pm-autoshot:server:animationFrame', 8000000, {
        id = id, name = name, frame = frameIndex, imageData = image, interval = interval,
        chromaKey = Customize.ChromaKeyColor or 'green',
        transparent = true,
        width = Customize.ScreenshotWidth or 512,
        height = Customize.ScreenshotHeight or 512
    })
    local deadline = GetGameTimer() + 20000
    while pending[id] and not pending[id].done and active and GetGameTimer() < deadline do Wait(25) end
    local result = pending[id]
    pending[id] = nil
    if not result or not result.done then return false, 'upload timed out' end
    return result.ok, result.detail
end
local function notice(message)
    print('[PM AutoShot] ' .. message)
end

RegisterCommand('shotanimstop', function()
    active = false
    ClearPedTasksImmediately(PlayerPedId())
    if capturing then TriggerEvent('pm-autoshot:client:closeAnimationStudio') end
    notice('Animation playback stopped')
end, false)

RegisterCommand('shotanim', function(_, args)
    if active or capturing then notice('An animation is already running. Use /shotanimstop first.'); return end
    local dict, clip = args[1], args[2]
    if not dict or not clip then
        notice('Usage: /shotanim <dictionary> <clip> [duration-ms] [flags]')
        return
    end
    local duration = math.min(math.max(tonumber(args[3]) or 5000, 500), 60000)
    local flags = tonumber(args[4]) or 1
    active = true
    CreateThread(function()
        RequestAnimDict(dict)
        local deadline = GetGameTimer() + 10000
        while not HasAnimDictLoaded(dict) and GetGameTimer() < deadline and active do Wait(50) end
        if not active then
            RemoveAnimDict(dict)
            return
        end
        if not HasAnimDictLoaded(dict) then
            notice('Animation dictionary timed out: ' .. dict)
            active = false
            return
        end
        local ped = PlayerPedId()
        ClearPedTasksImmediately(ped)
        TaskPlayAnim(ped, dict, clip, 8.0, 8.0, duration, flags, 0.0, false, false, false)
        notice(('Playing %s / %s (%d ms)'):format(dict, clip, duration))
        local finish = GetGameTimer() + duration
        while active and GetGameTimer() < finish do Wait(50) end
        if active then ClearPedTasks(ped) end
        RemoveAnimDict(dict)
        active = false
    end)
end, false)

-- First capture pipeline: playback + timed PNG frame uploads.
-- Frames are written into shots/animations/<name>/ as an intermediate sequence.
RegisterCommand('shotanimframes', function(_, args)
    if active or capturing then notice('Capture already in progress'); return end
    local dict, clip = args[1], args[2]
    if not dict or not clip then
        notice('Usage: /shotanimframes <dictionary> <clip> [frames 2-24] [interval-ms 100-1000]')
        return
    end
    local count = math.floor(math.min(24, math.max(2, tonumber(args[3]) or 8)))
    local interval = math.floor(math.min(1000, math.max(100, tonumber(args[4]) or 200)))
    local name = (args[5] or (dict .. '_' .. clip)):gsub('[^%w_-]', '_'):sub(1, 96)
    if name == '' then notice('Invalid animation identifier'); return end
    capturing = true
    active = true
    lastCaptureResult = nil
    CreateThread(function()
        RequestAnimDict(dict)
        local deadline = GetGameTimer() + 10000
        while active and not HasAnimDictLoaded(dict) and GetGameTimer() < deadline do Wait(50) end
        if not active or not HasAnimDictLoaded(dict) then
            notice('Animation dictionary unavailable or capture cancelled: ' .. dict)
            lastCaptureResult = { ok = false, name = name, reason = 'animation dictionary unavailable or cancelled' }
            capturing = false; active = false; return
        end
        studioResult = nil
        TriggerEvent('pm-autoshot:client:openAnimationStudio')
        local studioDeadline = GetGameTimer() + 15000
        while active and studioResult == nil and GetGameTimer() < studioDeadline do Wait(50) end
        if not active or not studioResult or not studioResult.ok then
            notice('Studio unavailable: ' .. tostring(studioResult and studioResult.reason or 'cancelled or timeout'))
            TriggerEvent('pm-autoshot:client:closeAnimationStudio')
            RemoveAnimDict(dict)
            lastCaptureResult = { ok = false, name = name, reason = 'studio unavailable or cancelled' }
            capturing = false; active = false; return
        end
        local ped = PlayerPedId()
        ClearPedTasksImmediately(ped)
        TaskPlayAnim(ped, dict, clip, 8.0, 8.0, -1, 1, 0.0, false, false, false)
        Wait(250)
        local sampled = {}
        local playbackStart = GetGameTimer()
        local previousSample = nil
        local actualIntervals = {}
        for i = 1, count do
            if not active then break end
            local target = playbackStart + (i - 1) * interval
            while active and GetGameTimer() < target do Wait(0) end
            if not active then break end
            local sampledAt = GetGameTimer()
            local image, err = screenshotFrame()
            if not image then
                notice('Screenshot ' .. i .. ' failed: ' .. tostring(err))
                break
            end
            -- Bound client-side screenshot memory during long batch sessions.
            if #image > 8 * 1024 * 1024 then
                notice('Screenshot exceeds 8 MiB safety limit')
                break
            end
            sampled[i] = image
            if previousSample then actualIntervals[#actualIntervals + 1] = sampledAt - previousSample end
            previousSample = sampledAt
        end
        local saved = 0
        -- Stop the animation before uploading; uploads can take several seconds.
        ClearPedTasks(ped)
        RemoveAnimDict(dict)
        if active and #sampled == count then
            local total = 0
            for _, elapsed in ipairs(actualIntervals) do total = total + elapsed end
            local outputInterval = #actualIntervals > 0 and math.max(1, math.floor(total / #actualIntervals + 0.5)) or interval
            for i = 1, count do
                if not active then break end
                local ok, detail = uploadFrame(name, i, outputInterval, sampled[i])
                sampled[i] = nil
                if not ok then
                    notice('Frame upload ' .. i .. ' failed: ' .. tostring(detail))
                    break
                end
                saved = saved + 1
            end
            interval = outputInterval
        end
        sampled = nil
        if active and saved == count then
            uploadSequence = uploadSequence + 1
            local id = uploadSequence
            finishResults[id] = { done = false }
            TriggerServerEvent('pm-autoshot:server:finishAnimation', { id = id, name = name, frames = count, interval = interval })
            local deadline = GetGameTimer() + 45000
            while active and not finishResults[id].done and GetGameTimer() < deadline do Wait(50) end
            local result = finishResults[id]
            finishResults[id] = nil
            if result and result.done and result.ok then
                lastCaptureResult = { ok = true, name = name, path = result.detail }
                notice('Animated WebP saved: ' .. tostring(result.detail))
            else
                lastCaptureResult = { ok = false, name = name, reason = result and result.detail or 'timeout' }
                notice('WebP export failed: ' .. tostring(result and result.detail or 'timeout'))
            end
        end
        if not lastCaptureResult then lastCaptureResult = { ok = false, name = name, reason = 'capture incomplete or cancelled' } end
        TriggerEvent('pm-autoshot:client:closeAnimationStudio')
        capturing = false; active = false
        notice(('Captured %d/%d PNG frames for %s'):format(saved, count, name))
    end)
end, false)

-- Catalog is fetched from the installed PM Emotes resource via the server.
local catalog = nil
local catalogError = nil
RegisterNetEvent('pm-autoshot:client:catalog', function(entries, err)
    catalog = type(entries) == 'table' and entries or {}
    catalogError = err
    notice(('PM Emotes catalog: %d dictionary animations%s'):format(#catalog, err and (' (' .. err .. ')') or ''))
end)

RegisterCommand('shotanimcatalog', function()
    catalog = nil
    catalogError = nil
    TriggerServerEvent('pm-autoshot:server:requestCatalog')
end, false)

local batchActive = false
RegisterCommand('shotanimbatchstop', function()
    batchActive = false
    ExecuteCommand('shotanimstop')
end, false)

RegisterCommand('shotanimbatch', function(_, args)
    if batchActive or capturing or active then notice('Capture is busy'); return end
    local first = math.max(1, math.floor(tonumber(args[1]) or 1))
    local count = math.max(1, math.min(25, math.floor(tonumber(args[2]) or 5)))
    local frames = math.max(2, math.min(24, math.floor(tonumber(args[3]) or 8)))
    local interval = math.max(100, math.min(1000, math.floor(tonumber(args[4]) or 200)))
    batchActive = true
    CreateThread(function()
        catalog = nil
        catalogError = nil
        TriggerServerEvent('pm-autoshot:server:requestCatalog')
        local deadline = GetGameTimer() + 10000
        while batchActive and catalog == nil and GetGameTimer() < deadline do Wait(100) end
        if not batchActive or not catalog or #catalog == 0 then
            notice('Batch unavailable: ' .. tostring(catalogError or 'catalog timeout or empty'))
            batchActive = false
            return
        end
        local last = math.min(#catalog, first + count - 1)
        for i = first, last do
            if not batchActive then break end
            local entry = catalog[i]
            notice(('Batch %d/%d: %s (%s)'):format(i, last, entry.key, entry.category))
            local outputName = (entry.category .. '_' .. entry.key):gsub('[^%w_-]', '_'):sub(1, 96)
            ExecuteCommand(('shotanimframes %s %s %d %d %s'):format(entry.dict, entry.clip, frames, interval, outputName))
            local startDeadline = GetGameTimer() + 3000
            while batchActive and not capturing and GetGameTimer() < startDeadline do Wait(50) end
            local endDeadline = GetGameTimer() + 120000
            while batchActive and capturing and GetGameTimer() < endDeadline do Wait(100) end
            if capturing then
                notice('Batch timed out on ' .. entry.key)
                ExecuteCommand('shotanimstop')
                break
            end
            if not lastCaptureResult or not lastCaptureResult.ok or lastCaptureResult.name ~= outputName then
                notice('Batch stopped at ' .. entry.key .. ': ' .. tostring(lastCaptureResult and lastCaptureResult.reason or 'no completion result'))
                break
            end
            Wait(300)
        end
        batchActive = false
        notice('Batch run ended')
    end)
end, false)
