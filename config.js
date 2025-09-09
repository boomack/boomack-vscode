const _ = require('lodash')
const path = require('node:path')
const fs = require('node:fs')
const vscode = require('vscode')
const YAML = require('yaml')

/**
 * @param {string} name
 */
function config(name) {
    const config = vscode.workspace.getConfiguration('boomack')
    return config.get(name)
}

const CONFIG_FILE_EXTENSIONS = ['', '.json', '.yaml', '.yml'];

/**
 * @param {string} fileName
 */
function configFileAlternatives(fileName) {
    return _.map(CONFIG_FILE_EXTENSIONS, ext => fileName + ext);
}

/**
 * @param {string} fileName
 */
async function loadOptionalYamlFile(fileName) {
    let text = null;
    for (const f of configFileAlternatives(fileName)) {
        try {
            text = await fs.promises.readFile(f, 'utf-8')
            break
        } catch (err) {
            if (err.code === 'ENOENT')
                continue
            else if (err.code === 'EISDIR')
                continue
            else
                throw err
        }
    }
    if (text === null) return {}
    return YAML.parse(text)
}

async function loadWorkspaceServerConfig() {
    const defaultConfig = {
        server: {
            host: '127.0.0.1',
            port: 3000,
            url: null,
        },
        client: {
            token: null,
            timeout: 5000,
            retry: 0,
            types: {},
        },
    }
    if (vscode.workspace.workspaceFolders.length === 0) return defaultConfig
    const projectRoot = vscode.workspace.workspaceFolders[0].uri.fsPath
    const serverConfig = await loadOptionalYamlFile(
        path.join(projectRoot, 'boomack-server'))
    const clientConfig = await loadOptionalYamlFile(
        path.join(projectRoot, 'boomack'))

    return _.pick(
        _.defaultsDeep({}, clientConfig, serverConfig, defaultConfig),
        ['server', 'client'])
}

module.exports = {
    config,
    loadWorkspaceServerConfig,
}
