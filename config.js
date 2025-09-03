const vscode = require('vscode')

/**
 * @param {string} name
 */
function config(name) {
    const config = vscode.workspace.getConfiguration('boomack')
    return config.get(name)
}

module.exports = {
    config,
}