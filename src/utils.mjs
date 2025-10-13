import { open } from 'node:fs/promises';
import { config } from './config.mjs'

/**
 * @template T
 * @param {T[]} arr
 * @param {T} value
 * @returns {T[]}
 */
export function removeItemOnce(arr, value) {
    var index = arr.indexOf(value);
    if (index > -1) {
        arr.splice(index, 1);
    }
    return arr;
}

/**
 * @param {import('node:fs').PathLike} filename
 * @param {number} [maxRead]
 */
export async function isFileBinary(filename, maxRead) {
    if (!maxRead) maxRead = 1024 * 1024
    const f = await open(filename, 'r')
    let possibleBinary = false
    try {
        const buffer = new Uint8Array(128 * 1024)
        let bytesRead = 0
        let readResult = null
        do {
            readResult = await f.read(buffer, 0, buffer.length, null)
            bytesRead += readResult.bytesRead
            for (let i = 0; i < readResult.bytesRead; i++) {
                const x = buffer[i]
                if (x <= 0x06 || (x >= 0x0E && x <= 0x1F)) {
                    possibleBinary = true
                    break
                }
            }
        } while(!possibleBinary && bytesRead < maxRead && readResult.bytesRead > 0)
    } finally {
        f.close()
    }
    return possibleBinary
}

/**
 * @param {number} x
 * @returns {string}
 */
function byte2char(x) {
    if (32 <= x && x <= 127) {
        return String.fromCodePoint(x)
    } else {
        return '\u002E'
    }
}

/**
 * @param {import('node:fs').PathLike} filename
 * @param {number} [bytesPerLine]
 * @param {number} [maxLines]
 */
export async function htmlViewOfBinaryFile(filename, bytesPerLine, maxLines) {
    if (!Number.isFinite(bytesPerLine)) {
        bytesPerLine = config('displayBinary.bytesPerLine')
    }
    if (!Number.isFinite(maxLines)) {
        maxLines = config('displayBinary.maxLines')
    }
    const maxRead = bytesPerLine * maxLines
    const f = await open(filename, 'r')
    const fstat = await f.stat()
    const buffer = new Uint8Array(maxRead)
    let readResult = null
    try {
        readResult = await f.read(buffer, 0, buffer.length)
    } finally {
        f.close()
    }
    const chunks = []
    /** @param {string} s */
    function h(s) { chunks.push(s) }

    h(`<h2>Binary File</h2><p><strong>Length:</strong> ${fstat.size} Bytes</p>\n`)
    if (bytesPerLine < 1 || maxLines < 1) { return chunks.join('\n') }
    h('<h3>Data</h3>')
    h('<style>')
    h('table.boomack-hex-display { line-height: 1em; }')
    h('table.ui.table.boomack-hex-display > thead > tr > th { padding-bottom: 0.6em }')
    h('</style>\n')
    h('<table class="ui very basic very collapsing compact celled table boomack-hex-display">')
    h('<thead>\n')
    h('<tr><th>&nbsp;</th><th><code>')
    for (let i = 0; i < bytesPerLine; i++) {
        h((i % 0xFF).toString(16).padStart(2, '0').toUpperCase())
        if (i < bytesPerLine - 1) h(' ')
    }
    h('</code></th><th>&nbsp;</th></tr>\n')
    h('</thead><tbody>\n')
    let p = 0

    /** @param {number} p */
    function dataLineHeader(p) {
        return p.toString(16).padStart(4, '0').toUpperCase()
    }

    const lineBytes = []
    let hexStr = ''
    while (p < readResult.bytesRead) {
        if (p % bytesPerLine === 0) {
            h('<tr><td><code>')
            h(dataLineHeader(p))
            h('</code></td><td><code>')
        }
        hexStr += (buffer[p] % 0xFF).toString(16).padStart(2, '0')
        lineBytes.push(buffer[p])
        p++
        if (p % bytesPerLine === 0) {
            h(hexStr.toUpperCase())
            hexStr = ''
            h('</code></td><td><code>')
            let charStr = ''
            for (const x of lineBytes) { charStr += byte2char(x) }
            h(charStr)
            h('</code></td></tr>\n')
            lineBytes.length = 0
        } else {
            hexStr += ' '
        }
    }
    if (p % bytesPerLine !== 0) {
        h(hexStr.toUpperCase())
        h('</td><td><code>')
        let charStr = ''
        for (const x of lineBytes) { charStr += byte2char(x) }
        h(charStr)
        h('</code></td></tr>\n')
    }
    if (p < fstat.size) {
        h('<tr><td>…</td><td>…</td><td>…</td><tr>\n')
    }
    h('</tbody></table>')
    return chunks.join('')
}
