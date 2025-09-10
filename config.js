const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const _ = require('lodash')
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

/**
 * Loads the config parts, relevant for the client,
 * merged from defaults,
 * `boomack-server[.json|.yaml|.yml]` in the workspace root directory,
 * and `boomack[.json|.yaml|.yml]` in the workspace root directory.
 *
 * @returns {Promise<Object>}
 */
async function loadWorkspaceClientConfig() {
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

/**
 * Loads the complete file-based configuration used by the workspace server.
 * The configuration is merged from
 * `.boomack-server[.json|.yaml|.yml]` in the users home directory
 * and `boomack-server[.json|.yaml|.yml]` in the workspace root directory.
 *
 * @returns {Promise<Object>}
 */
async function loadWorkspaceServerConfig() {
    if (vscode.workspace.workspaceFolders.length === 0) return {}
    const projectRoot = vscode.workspace.workspaceFolders[0].uri.fsPath
    const workspaceConfig = await loadOptionalYamlFile(
        path.join(projectRoot, 'boomack-server'))
    const userConfig = await loadOptionalYamlFile(
        path.join(os.homedir(), '.boomack-server'))
    return _.defaultsDeep({}, userConfig, workspaceConfig)
}

/**
 * @param {Object} runConfig
 * @returns {string[]}
 */
function getFileSrcRootsFromRunConfig(runConfig) {
    let roots = _.get(runConfig, 'api.request.fileSrcRoots', [])
    if (_.isString(roots)) roots = [roots]
    if (!_.isArray(roots)) roots = []
    return roots
}

module.exports = {
    config,
    loadWorkspaceClientConfig,
    loadWorkspaceServerConfig,
    getFileSrcRootsFromRunConfig,
}
