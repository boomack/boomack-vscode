import { join } from 'node:path'
import { homedir } from 'node:os'
import { promises } from 'node:fs'
import _ from 'lodash'
import { workspace } from 'vscode'
import { parse } from 'yaml'
import { fileTypePredicates } from 'boomack-js/config.js'

/**
 * @param {string} name
 */
export function config(name) {
    const config = workspace.getConfiguration('boomack')
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
            text = await promises.readFile(f, 'utf-8')
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
    return parse(text)
}

/**
 * Loads the config parts, relevant for the client,
 * merged from defaults,
 * `boomack-server[.json|.yaml|.yml]` in the workspace root directory,
 * and `boomack[.json|.yaml|.yml]` in the workspace root directory.
 *
 * @returns {Promise<Object>}
 */
export async function loadWorkspaceClientConfig() {
    const extensionRoot = __dirname // import.meta.dirname for ESM, but extension is packaged as CommonJS
    const defaultConfig = await loadOptionalYamlFile(
        join(extensionRoot, '..', 'defaultConfig'))
    let mergedConfig = null
    if (workspace.workspaceFolders.length > 0) {
        const projectRoot = workspace.workspaceFolders[0].uri.fsPath
        const serverConfig = await loadOptionalYamlFile(
            join(projectRoot, 'boomack-server'))
        const clientConfig = await loadOptionalYamlFile(
            join(projectRoot, 'boomack'))
        mergedConfig = _.pick(
            _.defaultsDeep({}, clientConfig, serverConfig, defaultConfig),
            ['server', 'client'])
    } else {
        mergedConfig = defaultConfig
    }
    mergedConfig.client.types = fileTypePredicates(mergedConfig.client.types)
    mergedConfig.client.sourceTypes = fileTypePredicates(mergedConfig.client.sourceTypes)
    mergedConfig.client.sourceLanguages = fileTypePredicates(mergedConfig.client.sourceLanguages)
    return mergedConfig
}

let defaultClientConfig = null

/**
 * Loads the default client config for non-workspace servers.
 *
 * @returns {Promise<Object>}
 */
export async function loadDefaultClientConfig() {
    if (defaultClientConfig) return defaultClientConfig
    const extensionRoot = __dirname // import.meta.dirname for ESM, but extension is packaged as CommonJS
    const defaultConfig = await loadOptionalYamlFile(
        join(extensionRoot, '..', 'defaultConfig'))
    defaultConfig.client.types = fileTypePredicates(defaultConfig.client.types)
    defaultConfig.client.sourceTypes = fileTypePredicates(defaultConfig.client.sourceTypes)
    defaultConfig.client.sourceLanguages = fileTypePredicates(defaultConfig.client.sourceLanguages)
    defaultClientConfig = defaultConfig
    return defaultConfig
}

/**
 * Loads the complete file-based configuration used by the workspace server.
 * The configuration is merged from
 * `.boomack-server[.json|.yaml|.yml]` in the users home directory
 * and `boomack-server[.json|.yaml|.yml]` in the workspace root directory.
 *
 * @returns {Promise<Object>}
 */
export async function loadWorkspaceServerConfig() {
    if (workspace.workspaceFolders.length === 0) return {}
    const projectRoot = workspace.workspaceFolders[0].uri.fsPath
    const workspaceConfig = await loadOptionalYamlFile(
        join(projectRoot, 'boomack-server'))
    const userConfig = await loadOptionalYamlFile(
        join(homedir(), '.boomack-server'))
    return _.defaultsDeep({}, userConfig, workspaceConfig)
}

/**
 * @param {Object} runConfig
 * @returns {string[]}
 */
export function getFileSrcRootsFromRunConfig(runConfig) {
    let roots = _.get(runConfig, 'api.request.fileSrcRoots', [])
    if (typeof roots === 'string') roots = [roots]
    if (!Array.isArray(roots)) roots = []
    return roots
}
