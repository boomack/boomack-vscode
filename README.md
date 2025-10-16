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

## Commands and Keybindings

This extension contributes the following commands with default key bindings:  
(on MacOS the <kbd>Ctrl</kbd> is replaced by <kbd>Cmd</kbd>)

* `boomack.server.add`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>N</kbd> <kbd>H</kbd>
* `boomack.server.remove`
* `boomack.workspaceServer.reloadConfig`
* `boomack.workspaceServer.start`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>U</kbd>
* `boomack.workspaceServer.stop`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>K</kbd>
* `boomack.server.select`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>S</kbd> <kbd>H</kbd>
* `boomack.server.openInBrowser`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>O</kbd> <kbd>H</kbd>
* `boomack.server.refresh`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>R</kbd> <kbd>H</kbd>
* `boomack.panel.add`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>N</kbd> <kbd>P</kbd>
* `boomack.panel.select`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>S</kbd> <kbd>P</kbd>
* `boomack.panel.clear`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>X</kbd> <kbd>P</kbd>
* `boomack.panel.remove`
* `boomack.panel.openInBrowser`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>O</kbd> <kbd>P</kbd>
* `boomack.panel.reloadInBrowser`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>Ctrl</kbd>+<kbd>R</kbd>
* `boomack.panel.refresh`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>R</kbd> <kbd>P</kbd>
* `boomack.panel.revertMaximizedSlot`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>Ctrl</kbd>+<kbd>M</kbd>
* `boomack.panel.update.withActiveDocument`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>P</kbd>
* `boomack.slot.select`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>S</kbd> <kbd>S</kbd>
* `boomack.slot.clear`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>X</kbd> <kbd>S</kbd>
* `boomack.slot.openInBrowser`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>O</kbd> <kbd>S</kbd>
* `boomack.slot.zoomIn`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>Z</kbd> <kbd>I</kbd>
* `boomack.slot.zoomOut`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>Z</kbd> <kbd>O</kbd>
* `boomack.slot.maximize`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>M</kbd>
* `boomack.display.activeDocument`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>D</kbd>
* `boomack.display.activeDocument.source`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>Ctrl</kbd>+<kbd>D</kbd>
* `boomack.display.activeDocument.withMediaType`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>Shift</kbd>+<kbd>D</kbd>
* `boomack.display.activeDocument.asDisplayRequest`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>Q</kbd>
* `boomack.display.activeDocument.inSlot.withId`
* `boomack.display.activeDocument.source.inSlot.withId`
* `boomack.display.activeDocument.withMediaType.inSlot.withId`
* `boomack.display.activeNotebookCell`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>C</kbd>
* `boomack.display.activeNotebookCell.source`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>Ctrl</kbd>+<kbd>C</kbd>
* `boomack.display.currentSelection.source`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>Ctrl</kbd>+<kbd>L</kbd>
* `boomack.display.currentSelection.withMediaType`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>Shift</kbd>+<kbd>L</kbd>
* `boomack.playbook.execute.activeDocument`
  <kbd>Ctrl</kbd>+<kbd>L</kbd> <kbd>B</kbd>

## Extension Settings

This extension contributes the following settings:

* `boomack.server.installation`: The Boomack installation to run as Project Server (auto, embedded, system, or custom)
* `boomack.server.executable`: An absolute path to the executable of the Boomack server
* `boomack.server.plugins.bundled`: Use Boomack plug-ins that come bundled with the VS Code extension
* `boomack.server.plugins.rootPath`: Path to custom node_modules folder where to look for plug-ins
* `boomack.server.verbose`: Run the Boomack Project Server with verbose output
* `boomack.client.timeout`: The request timeout in milliseconds
* `boomack.client.retry`: The number of retries in case of a failed request
* `boomack.displayTitle`: The title for display requests to Boomack (none, filename, or filepath)
* `boomack.notebook.outputSelection`: How to select one of multiple cell outputs in a notebook for display (auto, or user)
* `boomack.displayBinary.bytesPerLine`: The number of bytes to display in one line, when displaying the source of a binary file
* `boomack.displayBinary.maxLines`: The maximum number of lines, when displaying the source of a binary file
