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
 * @typedef {Object} SlotUIState
 * @property {?PanelUIState} panel
 * @property {string} id
 * @property {boolean} defaultSlot
 */

/**
 * @typedef {Object} PanelUIState
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

exports.WORKSPACE_SERVER_NAME = '<workspace>'
