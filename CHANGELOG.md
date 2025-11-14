# Change Log

All notable changes to the "boomack-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

Currently this project is in alpha stage.

## 0.1.10

### Added

- Media types for file extensions: `*.vega`, `*.vegalite`, `*.mermaid`, `*.leaflet`
- Playbook Sequence Steps
- JSON schema for `*.boom-step.(json|yaml|yml)`

### Fixed

- URL for JSON schema für `boomack-server.json`
- Media type lookup
- Support for YAML merge keys

## 0.1.9

### Added

- Command `boomack.display.selection` <kbd>Ctrl</kbd>+<kbd>L</kbd>&nbsp;<kbd>L</kbd>
- Suggestions for media type in `boomack.display.selection.withMediaType`

### Changed

- Sort media types for user selection
- Automatically select project server when it started

### Fixed

- Media type mapping from client configuration
  only for project server

## 0.1.8

### Added

- JSON schema for server configuration
- Setting `boomack.client.debugRequests`
- Setting `boomack.client.fileSrc.enable`
- Setting `boomack.client.fileSrc.hosts`

## 0.1.7

### Changed

- Boomack Server 0.15.0-preview5
- PDF PlugIn 0.2.0

### Added

- Hide/Show/Toggle slot in panel

## 0.1.6

### Added

- New configuration options
  - `boomack.server.executable`

### Fixed

- Relative URLs in playbooks not working

## 0.1.5

### Added

- New configuration options
  - `boomack.server.plugins.bundled`
  - `boomack.server.plugins.rootPath`
- Official plugins
  - `boomack-plugin-pdf`

### Fixed

- Various

## 0.1.4

### Added

- Official plugins
  - `boomack-plugin-mermaid`
  - `boomack-plugin-vega`
  - `boomack-plugin-leaflet`

### Fixed

- Various

## 0.1.2

Include npm dependencies in VS Code extension package.
_(Not working)_

## 0.1.1

Initial implementation.
_(Not working)_
