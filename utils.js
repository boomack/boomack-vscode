import { open } from 'node:fs/promises';

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
 * @param {import('node:fs').PathLike} filename
 * @param {number} [bytesPerLine]
 * @param {number} [maxLines]
 */
export async function textViewOfBinaryFile(filename, bytesPerLine, maxLines) {
    if (!bytesPerLine) bytesPerLine = 16 // TODO make configurable
    if (!maxLines) maxLines = 64 // TODO make configurable
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
    const lines = []
    lines.push('Binary File')
    lines.push(`Length: ${fstat.size} Bytes`)
    lines.push('')
    let headerLine = '      '
    for (let i = 0; i < bytesPerLine; i++) {
        let headerField = ' ' + (i % 0xFF).toString(16).padStart(2, '0')
        headerLine += headerField
    }
    lines.push(headerLine)
    lines.push('-'.repeat(bytesPerLine * 3 + 6))
    let p = 0

    function dataLineHeader(p) {
        return p.toString(16).padStart(4, '0') + ' |'
    }

    let dataLine = '0000 |'
    while (p < readResult.bytesRead) {
        // TODO add visible characters after HEX representation
        dataLine += ' ' + (buffer[p] % 0xFF).toString(16).padStart(2, '0')
        p++
        if (p % bytesPerLine === 0) {
            lines.push(dataLine)
            dataLine = dataLineHeader(p)
        }
    }
    if (p % bytesPerLine !== 0) {
        lines.push(dataLine)
    }
    if (readResult.bytesRead < fstat.size) {
        lines.push(' ... | ...')
    }
    lines.push('-'.repeat(bytesPerLine * 3 + 6))
    return lines.join('\n')
}
