import { join } from 'node:path'
import { homedir } from 'node:os'
import { promises } from 'node:fs'
import { map, pick, defaultsDeep, get, isString, isArray } from 'lodash-es'
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
    return map(CONFIG_FILE_EXTENSIONS, ext => fileName + ext);
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
    const defaultConfig = await loadOptionalYamlFile(
        join(import.meta.dirname, 'defaultConfig'))
    if (workspace.workspaceFolders.length === 0) return defaultConfig
    const projectRoot = workspace.workspaceFolders[0].uri.fsPath
    const serverConfig = await loadOptionalYamlFile(
        join(projectRoot, 'boomack-server'))
    const clientConfig = await loadOptionalYamlFile(
        join(projectRoot, 'boomack'))
    const mergedConfig = pick(
        defaultsDeep({}, clientConfig, serverConfig, defaultConfig),
        ['server', 'client'])
    mergedConfig.client.types = fileTypePredicates(mergedConfig.client.types)
    mergedConfig.client.sourceTypes = fileTypePredicates(mergedConfig.client.sourceTypes)
    mergedConfig.client.sourceLanguages = fileTypePredicates(mergedConfig.client.sourceLanguages)
    return mergedConfig
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
    return defaultsDeep({}, userConfig, workspaceConfig)
}

/**
 * @param {Object} runConfig
 * @returns {string[]}
 */
export function getFileSrcRootsFromRunConfig(runConfig) {
    let roots = get(runConfig, 'api.request.fileSrcRoots', [])
    if (isString(roots)) roots = [roots]
    if (!isArray(roots)) roots = []
    return roots
}
