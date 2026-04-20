/**
 * Kartotéka — Build script
 * Összefűzi és minifikálja a JS fájlokat oldalankénti bundle-ökbe.
 * Használat: npm run build
 */
var esbuild = require('esbuild');
var fs = require('fs');
var path = require('path');

var JS_DIR = path.join(__dirname, 'pages', 'js');
var OUT_DIR = path.join(JS_DIR, 'dist');

// --- Bundle definíciók ---
// Minden bundle: fájlok listája a pages/js/ könyvtárból, sorrendben
var bundles = {
    'common': [
        'supabase_config.js',
        'component_cache.js',
        'session_cache.js',
        'lazy_libs.js',
        'data_cache.js',
        'offline_db.js',
        'offline_sync.js',
        'smart_query.js',
        'auth_roles.js',
        'profile_api.js',
        'congregation_api.js',
        'ai_config.js',
        'ai_chat.js',
        'notifications.js',
        'support.js'
    ],
    'dashboard': [
        'dashboard_api.js'
    ],
    'tagnyilvantartas': [
        'lookup_api.js',
        'member_api.js',
        'csalad_api.js',
        'mass_import_api.js',
        'presbiter_korzet_api.js',
        'sync_api.js'
    ],
    'penzugy': [
        'lookup_api.js',
        'penzugy_init.js',
        'penzugy_budget.js',
        'penzugy_accounting.js',
        'penzugy_monetary.js',
        'penzugy_transactions.js',
        'penzugy_print_engine.js',
        'penzugy_print_budget.js',
        'penzugy_print_accounting.js',
        'penzugy_bank_api.js',
        'penzugy_income.js',
        'penzugy_expense.js',
        'penzugy_unified_modal.js',
        'penzugy_audit.js',
        'penzugy_tartozasok.js',
        'penzugy_tranzakciok.js'
    ],
    'anyakonyv': [
        'anyakonyv_api.js',
        'member_api.js'
    ],
    'munkanaplo': [
        'worklog_api.js'
    ],
    'leltar': [
        'mass_import_api.js',
        'leltar.js',
        'leltar_print_jelentes.js'
    ],
    'misszios': [
        'misszios_muhely_api.js',
        'misszios_muhely_otletek.js',
        'misszios_muhely_gamification.js'
    ],
    'iktato': [
        'iktato_api.js'
    ],
    'sirhelyek': [
        'sirhely_api.js'
    ],
    'misszios_sziget': [
        'r2_config.js',
        'misszios_muhely_sziget.js'
    ],
    'egyhazmegye': [
        'penzugy_print_budget.js',
        'penzugy_print_accounting.js'
    ],
    'admin': [
        'admin_api.js'
    ]
};

async function build() {
    // Kimeneti könyvtár létrehozása
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    var totalOriginal = 0;
    var totalMinified = 0;
    var results = [];

    for (var name in bundles) {
        var files = bundles[name];
        // Fájlok összefűzése
        var code = '';
        var missing = [];
        for (var i = 0; i < files.length; i++) {
            var filePath = path.join(JS_DIR, files[i]);
            if (!fs.existsSync(filePath)) {
                missing.push(files[i]);
                continue;
            }
            code += '/* === ' + files[i] + ' === */\n';
            code += fs.readFileSync(filePath, 'utf8') + '\n';
        }

        if (missing.length > 0) {
            console.warn('  FIGYELEM: hiányzó fájlok a "' + name + '" bundle-ben: ' + missing.join(', '));
        }

        if (code.length === 0) {
            console.warn('  KIHAGYVA: "' + name + '" — üres bundle');
            continue;
        }

        totalOriginal += code.length;

        // Minifikálás esbuild-del
        var result = await esbuild.transform(code, {
            minify: true,
            target: 'es2018',
            legalComments: 'none'
        });

        totalMinified += result.code.length;

        var outPath = path.join(OUT_DIR, name + '.min.js');
        fs.writeFileSync(outPath, result.code);

        var originalKB = (code.length / 1024).toFixed(0);
        var minifiedKB = (result.code.length / 1024).toFixed(0);
        var savings = ((1 - result.code.length / code.length) * 100).toFixed(1);

        results.push({
            name: name + '.min.js',
            original: originalKB,
            minified: minifiedKB,
            savings: savings
        });

        console.log('  ' + name + '.min.js: ' + originalKB + 'KB → ' + minifiedKB + 'KB (-' + savings + '%)');
    }

    console.log('');
    console.log('Összesen: ' + (totalOriginal / 1024).toFixed(0) + 'KB → ' + (totalMinified / 1024).toFixed(0) + 'KB (-' + ((1 - totalMinified / totalOriginal) * 100).toFixed(1) + '%)');
    console.log('Kimeneti könyvtár: ' + OUT_DIR);

    // Verzió fájl írása (cache-busting)
    var version = Date.now().toString(36);
    fs.writeFileSync(path.join(OUT_DIR, 'version.txt'), version);
    console.log('Build verzió: ' + version);
}

console.log('Kartotéka build indítása...\n');
build().then(function() {
    console.log('\nBuild kész!');
}).catch(function(err) {
    console.error('Build hiba:', err);
    process.exit(1);
});
