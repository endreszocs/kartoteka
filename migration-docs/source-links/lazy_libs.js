// ============================================================
//  KARTOTÉKA — Lazy Library Loader
//  Nehéz könyvtárak igény szerinti betöltése
//  (ApexCharts, SheetJS, html2pdf, Chart.js, ZXing)
// ============================================================

(function() {
    var _loaded = {};
    var _loading = {};

    var LIB_URLS = {
        apexcharts: 'https://cdn.jsdelivr.net/npm/apexcharts@5.10.4/dist/apexcharts.min.js',
        xlsx:       'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
        html2pdf:   'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
        chartjs:    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
        zxing:      'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
        familytree: 'https://balkan.app/js/familytree.js'
    };

    /**
     * Könyvtár betöltése — csak egyszer, visszaadja a Promise-t
     * @param {string} name - könyvtár neve (apexcharts, xlsx, html2pdf, chartjs, zxing)
     * @returns {Promise<void>}
     */
    window.loadLib = function(name) {
        if (_loaded[name]) return Promise.resolve();
        if (_loading[name]) return _loading[name];

        var url = LIB_URLS[name];
        if (!url) return Promise.reject(new Error('Ismeretlen könyvtár: ' + name));

        _loading[name] = new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.src = url;
            script.onload = function() {
                _loaded[name] = true;
                delete _loading[name];
                resolve();
            };
            script.onerror = function() {
                delete _loading[name];
                reject(new Error('Nem sikerült betölteni: ' + name));
            };
            document.head.appendChild(script);
        });

        return _loading[name];
    };

    /**
     * Több könyvtár párhuzamos betöltése
     * @param {string[]} names - könyvtár nevek tömbje
     * @returns {Promise<void>}
     */
    window.loadLibs = function(names) {
        return Promise.all(names.map(function(n) { return loadLib(n); }));
    };
})();
