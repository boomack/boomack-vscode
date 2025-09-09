/**
 * @typedef {Object} BoomackServer
 * @property {string} name A user readable identifier for the server
 * @property {string} url The HTTP(S) URL of the Boomack server
 * @property {?string} token The API authentication token
 */

/**
 * @typedef {Object} SlotDefinition
 * @property {string} id
 * @property {number} index
 */

/**
 * @typedef {Object} PanelDefinition
 * @property {string} title
 * @property {string} type
 * @property {string} defaultSlot
 * @property {SlotDefinition[]} slots
 */

/**
 * @typedef {Object} UIState
 * @property {string} stateType
 */

/**
 * @typedef {Object} SlotUIState
 * @extends {UIState}
 * @property {?PanelUIState} panel
 * @property {string} id
 * @property {boolean} defaultSlot
 */

/**
 * @typedef {Object} PanelUIState
 * @extends {UIState}
 * @property {?ServerUIState} server
 * @property {boolean} invalid
 * @property {string} id
 * @property {?PanelDefinition} definition
 * @property {Object.<string, SlotUIState>} slots
 * @property {?string} defaultSlotId
 * @property {?string} selectedSlotId
 */

/**
 * @typedef {Object} ServerUIState
 * @extends {UIState}
 * @property {boolean} invalid
 * @property {?BoomackServer} server
 * @property {string} name
 * @property {?boolean} running
 * @property {?string[]} panelIds
 * @property {Object.<string, PanelUIState>} panels
 * @property {?string} selectedPanelId
 */

/**
 * @typedef {Object} BoomackTarget
 * @property {BoomackServer} server
 * @property {string} panelId
 * @property {?string} slotId
 */

const WORKSPACE_SERVER_NAME = '<workspace>'
const WORKSPACE_SERVER_LABEL = 'Project Server'


/**
 * @param {any} state
 * @returns {boolean}
 */
function isServerState(state) {
    return typeof(state) === 'object' && state?.stateType === 'server'
}

/**
 * @param {any} state
 * @returns {boolean}
 */
function isPanelState(state) {
    return typeof(state) === 'object' && state?.stateType === 'panel'
}

/**
 * @param {any} state
 * @returns {boolean}
 */
function isSlotState(state) {
    return typeof(state) === 'object' && state?.stateType === 'slot'
}

module.exports = {
    WORKSPACE_SERVER_NAME,
    WORKSPACE_SERVER_LABEL,
    isServerState,
    isPanelState,
    isSlotState,
}