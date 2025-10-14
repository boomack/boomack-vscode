import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import {
    Uri,
    window,
    workspace,
} from 'vscode'
import { lookpath } from 'lookpath'
import { config } from './config.mjs'

const boomackServerMainScript = 'server-build/cli.mjs'

/**
 * @typedef {import('vscode').ExtensionContext} ExtensionContext
 * @typedef {import('vscode').Terminal} Terminal
 */

/**
 * @param {ExtensionContext} context
 * @returns {string}
 */
export function bundledModulesPath(context) {
    return join(context.extensionPath, 'server', 'node_modules')
}

/**
 * @param {ExtensionContext} context
 * @returns {string}
 */
function bundledBoomackServerScriptPath(context) {
    return join(bundledModulesPath(context), 'boomack', boomackServerMainScript)
}

/**
 * @param {ExtensionContext} context
 * @param {boolean} showMessage
 * @returns {Promise<{ cmd: string, args: string[] }|undefined>}
 */
async function getBundledBoomackServerCommandLine(context, showMessage) {
    const nodeExePath = await lookpath('node')
    if (!nodeExePath) {
        if (showMessage) {
            window.showErrorMessage(
                "Can not find NodeJS executable on PATH."
                + " Please install NodeJS to run bundled Boomack server.")
        }
        return undefined
    }
    return {
        cmd: nodeExePath,
        args: [bundledBoomackServerScriptPath(context)]
    }
}

/**
 * @param {string} filename
 * @returns {Promise<string|undefined>}
 */
async function getScriptPathFromCmdWrapper(filename) {
    const scriptText = await readFile(filename, { encoding: 'ascii' })
    const match = /"(?:%~dp0|%dp0%)\\(.+?\.js)"/.exec(scriptText)
    return match
        ? resolve(dirname(filename), match[1])
        : undefined
}

/**
 * @param {boolean} showMessage
 * @returns {Promise<{ cmd: string, args: string[] }|undefined>}
 */
async function getSystemBoomackServerCommandLine(showMessage) {
    const boomackExePath = await lookpath('boomack')
    if (!boomackExePath) {
        if (showMessage) {
            window.showErrorMessage(
                "Can not find Boomack Server executable on PATH."
                + " Please install Boomack Server.")
        }
        return undefined
    }
    if (basename(boomackExePath).toLowerCase() === 'boomack.cmd') {
        const scriptPath = await getScriptPathFromCmdWrapper(boomackExePath)
        if (!scriptPath) {
            return { cmd: 'cmd.exe', args: [ '/C', boomackExePath ] }
        }
        const localNodeExe = join(dirname(boomackExePath), 'node.exe')
        if (existsSync(localNodeExe)) {
            return {
                cmd: localNodeExe,
                args: [scriptPath]
            }
        }
        const nodeExe = await lookpath('node')
        if (!nodeExe) {
            if (showMessage) {
                window.showErrorMessage(
                    "Can not find NodeJS executable on PATH."
                    + " Please install NodeJS to run bundled Boomack server.")
            }
            return undefined
        }
        return {
            cmd: nodeExe,
            args: [scriptPath]
        }
    } else {
        return { cmd: boomackExePath, args: [] }
    }
}

/**
 * @param {ExtensionContext} context
 * @returns {Promise<{ cmd: string, args: string[] }|undefined>}
 */
export async function getBoomackServerCommandLine(context) {
    const installation = config('server.installation')
    if (installation === 'bundled') {
        return await getBundledBoomackServerCommandLine(context, true)
    } else if (installation === 'system') {
        return await getSystemBoomackServerCommandLine(true)
    }
    const bundledCommandLine = await getBundledBoomackServerCommandLine(context, false)
    if (bundledCommandLine) return bundledCommandLine
    const systemCommandLine = await getSystemBoomackServerCommandLine(false)
    if (systemCommandLine) return systemCommandLine
    window.showErrorMessage(
        "Can neither find NodeJS nor Boomack Server on PATH."
        + " Install one of these to run Boomack Server.")
    return undefined
}

/**
 * @param {ExtensionContext} context
 * @param {string} label
 * @param {?string} message
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} [cwd]
 * @param {function (Terminal): void} [endCb]
 * @returns {Terminal}
 */
export function runInTerminal(context, label, message, cmd, args, cwd, endCb) {

    const terminal = window.createTerminal({
        iconPath: Uri.joinPath(context.extensionUri, 'res', 'boomack-logo.svg'),
        name: label,
        cwd: cwd ?? workspace.workspaceFolders[0].uri.fsPath,
        env: process.env,
        message: message,
        shellPath: cmd,
        shellArgs: args,
    })

    terminal.processId.then(pid => {
        if (!pid) return
        const handle = setInterval(() => {
            try {
                process.kill(pid, 0) // throws if the process no longer exists
            } catch {
                clearInterval(handle)
                if (endCb) endCb(terminal)
            }
        }, 500)
    })

    terminal.show()
    return terminal
}
