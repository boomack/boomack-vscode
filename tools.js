import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
    Uri,
    window,
    workspace,
} from 'vscode'

/**
 * @typedef {import('vscode').ExtensionContext} ExtensionContext
 * @typedef {import('vscode').Terminal} Terminal
 */

/**
 * @param {string} scriptName
 * @returns {string | undefined}
 */
function platformSpecificExecutable(scriptName) {
    // The wrapper is a .ps1 or .cmd file on Windows
    // On Linux/MacOS it is a plain executable file
    if (process.platform === 'win32') {
        const batchFileName = `${scriptName}.cmd`
        if (existsSync(batchFileName)) {
            return batchFileName
        }
        const pwshScriptName = `${scriptName}.ps1`
        if (existsSync(pwshScriptName)) {
            return pwshScriptName
        }
    } else {
        if (existsSync(scriptName)) {
            return scriptName
        }
    }
    return undefined
}

/**
 * Returns the absolute path to the executable that ships with the extension.
 * Works for both Windows (`.cmd`/`.ps1`) and *nix (no extension).
 * 
 * @param {ExtensionContext} context
 * @param {string} toolName
 * @returns {string}
 */
export function getToolPath(context, toolName) {
    // look in shared .bin folder of extensions
    const binPath = platformSpecificExecutable(
        join(context.extensionPath, 'node_modules', '.bin', toolName))
    if (binPath) return binPath

    // look inside the bin folder of the package itself
    const pkgBinPath = platformSpecificExecutable(
        join(context.extensionPath, 'node_modules', toolName, 'bin', toolName))
    if (pkgBinPath) return pkgBinPath

    throw new Error(`Did not find the executable of "${toolName}". Expected at ${binPath} or ${pkgBinPath}`)
}

/**
 * @param {ExtensionContext} context
 * @param {string} label
 * @param {?string} message
 * @param {string} toolName
 * @param {string[]} args
 * @param {string} [cwd]
 * @param {function (): void} [endCb]
 * @returns {Terminal}
 */
export function runToolInTerminal(context, label, message, toolName, args, cwd, endCb) {
    const execPath = getToolPath(context, toolName);

    // TODO run JavaScript package without a shell
    // TODO rename 'tool' into 'jsScript'

    /** @type {?string} */
    let cmd = null
    let cmdArgs = []
    if (execPath.toLowerCase().endsWith('.cmd')) {
        cmd = 'cmd.exe'
        cmdArgs.push('/C')
        cmdArgs.push(execPath)
    } else if (execPath.toLowerCase().endsWith('.ps1')) {
        cmd = 'powershell.exe'
        cmdArgs.push('-NoLogo')
        cmdArgs.push('-NoProfile')
        cmdArgs.push('-ExecutionPolicy')
        cmdArgs.push('ByPass')
        cmdArgs.push('-File')
        cmdArgs.push(execPath)
    } else {
        cmd = execPath
    }
    for (const arg of args) { cmdArgs.push(arg) }

    const terminal = window.createTerminal({
        iconPath: Uri.joinPath(context.extensionUri, 'res', 'boomack-logo.svg'),
        name: label,
        cwd: cwd ?? workspace.workspaceFolders[0].uri.fsPath,
        env: process.env,
        message: message,
        shellPath: cmd,
        shellArgs: cmdArgs,
    })

    terminal.processId.then(pid => {
        if (!pid) return
        const handle = setInterval(() => {
            try {
                process.kill(pid, 0) // throws if the process no longer exists
            } catch {
                clearInterval(handle)
                if (endCb) endCb()
            }
        }, 500)
    })

    terminal.show()
    return terminal
}
