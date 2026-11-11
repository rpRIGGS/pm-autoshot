-- PM AutoShot animation capture prototype. Standalone test command.
-- The production batch pipeline will reuse the existing AutoShot studio camera.
local active = false
local function notice(message)
    print('[PM AutoShot] ' .. message)
end

RegisterCommand('shotanimstop', function()
    active = false
    ClearPedTasksImmediately(PlayerPedId())
    notice('Animation playback stopped')
end, false)

RegisterCommand('shotanim', function(_, args)
    if active then notice('An animation is already running. Use /shotanimstop first.'); return end
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
        if not active then return end
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
