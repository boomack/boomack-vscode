/* jshint esversion: 8 */

const api = require('./api');

const titledLayout = {
    "grid": { "rows": 7 },
    "defaultSlot": "primary",
    "slots": {
        "title": { },
        "primary": { "row": 1, "rowSpan": 3 },
        "secondary": { "row": 4, "rowSpan": 3 },
    },
};

(async () => {
    await api.requestLayout('default', titledLayout);
    await api.displayMediaItems([
        { slot: 'title', type: 'text/html', text: '<h1>Webpage in IFRAME</h1>' },
        { slot: 'primary', type: 'text/html', src: 'https://dict.leo.org/englisch-deutsch/' },
        { slot: 'secondary', type: 'text/html', src: 'https://github.com/' },
    ]);
})();
