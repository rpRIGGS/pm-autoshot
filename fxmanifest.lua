fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'PM AutoShot'
description 'PowerMoves RP AutoShot studio and animation preview capture'
author 'UZ'
version '2.3.0'
repository 'https://github.com/rpRIGGS/pm-autoshot'

shared_scripts {
    'Customize.lua',
}

client_scripts {
    'client/client.lua',
    'client/animation_capture.lua',
}

server_scripts {
    'server/version.lua',
    'server/config_bridge.lua',
    'server/server.js',
}

ui_page 'resources/build/index.html'

files {
    'resources/build/index.html',
    'resources/build/**/*',
    'shots/**/*',
}

dependencies {
    'screenshot-basic',
    'yarn'
}
