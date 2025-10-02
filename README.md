# Boomack VS Code Extension

This extensions allows to interact with a Boomack server.

## Features

* Start and stop project server
* Select server, panel, and slot as current target
* Open server, panel, or slot in default browser
* Add and remove panels
* Set panel layout from editor content
* Set panel layout from file in file explorer
* Clear content from panel or slot
* Display editor content as media item in panel, or specific slot
* Display source from editor in panel, or specific slot
* Display file from file explorer as media item
* Display source of file from file explorer
* File Types with JSON schema support
    + `*.boom-request.(json|yaml|yml)` One or multiple Display Requests
    + `*.boom-panel.(json|yaml|yml)` Panel Layout
    + `*.boom.(json|yaml|yml)` Boomack Playbook
* Views for servers, panels, and slots

## Extension Settings

This extension contributes the following settings:

* `boomack.autoSelect.server`: Automatically select default server, when extension is activated
* `boomack.autoSelect.panel`: Automatically select default panel, when server is selected
* `boomack.autoSelect.slot`: Automatically select default slot, when panel is selected

## Release Notes

Currently this project is in alpha stage.

### 0.1.0

Initial implementation.
