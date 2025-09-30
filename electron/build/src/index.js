"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const electron_1 = require("@capacitor-community/electron");
const electron_2 = require("electron");
const electron_is_dev_1 = tslib_1.__importDefault(require("electron-is-dev"));
const electron_unhandled_1 = tslib_1.__importDefault(require("electron-unhandled"));
const electron_updater_1 = require("electron-updater");
const setup_1 = require("./setup");
// Graceful handling of unhandled errors.
(0, electron_unhandled_1.default)();
// CRITICAL: Setup SQLite configuration BEFORE any imports or app initialization
const setupSQLiteConfiguration = () => {
    // Method 1: Set global configuration
    global.CapacitorSQLiteConfig = {
        electronIsEncryption: false,
        electronWindowsLocation: 'default',
        electronMacLocation: 'default'
    };
    // Method 2: Set environment variables
    process.env.CAPACITOR_SQLITE_ELECTRON_IS_ENCRYPTION = 'false';
    process.env.CAPACITOR_SQLITE_ELECTRON_WINDOWS_LOCATION = 'default';
    process.env.CAPACITOR_SQLITE_ELECTRON_MAC_LOCATION = 'default';
    // Method 3: Patch the module before it's loaded
    try {
        const Module = require('module');
        const originalRequire = Module.prototype.require;
        Module.prototype.require = function (id) {
            if (id === '@capacitor-community/sqlite/electron') {
                const sqliteModule = originalRequire.apply(this, arguments);
                // Patch UtilsFile constructor if it exists
                if (sqliteModule && typeof sqliteModule === 'object') {
                    const patchConstructor = (target, name) => {
                        if (target[name] && typeof target[name] === 'function') {
                            const OriginalConstructor = target[name];
                            target[name] = function (...args) {
                                // Ensure config is available
                                const config = args[0] || {
                                    electronIsEncryption: false,
                                    electronWindowsLocation: 'default',
                                    electronMacLocation: 'default'
                                };
                                return new OriginalConstructor(config, ...args.slice(1));
                            };
                            // Preserve prototype
                            target[name].prototype = OriginalConstructor.prototype;
                        }
                    };
                    // Try to patch various possible constructors
                    if (sqliteModule.UtilsFile)
                        patchConstructor(sqliteModule, 'UtilsFile');
                    if (sqliteModule.CapacitorSQLite) {
                        // Patch the CapacitorSQLite constructor
                        const OriginalCapacitorSQLite = sqliteModule.CapacitorSQLite;
                        sqliteModule.CapacitorSQLite = function (...args) {
                            // Set the config before calling the original constructor
                            global.CapacitorSQLiteElectronConfig = {
                                electronIsEncryption: false,
                                electronWindowsLocation: 'default',
                                electronMacLocation: 'default'
                            };
                            return new OriginalCapacitorSQLite(...args);
                        };
                        sqliteModule.CapacitorSQLite.prototype = OriginalCapacitorSQLite.prototype;
                    }
                }
                return sqliteModule;
            }
            return originalRequire.apply(this, arguments);
        };
    }
    catch (error) {
        console.warn('Could not patch SQLite module:', error);
    }
    console.log('SQLite configuration setup completed');
};
// Call this FIRST, before any other initialization
setupSQLiteConfiguration();
// Define our menu templates (these are optional)
const trayMenuTemplate = [new electron_2.MenuItem({ label: 'Quit App', role: 'quit' })];
const appMenuBarMenuTemplate = [
    { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
    { role: 'viewMenu' },
];
// Get Config options from capacitor.config
const capacitorFileConfig = (0, electron_1.getCapacitorElectronConfig)();
// Enhance the config with SQLite settings
const enhancedConfig = Object.assign(Object.assign({}, capacitorFileConfig), { plugins: Object.assign(Object.assign({}, capacitorFileConfig.plugins), { CapacitorSQLite: {
            electronIsEncryption: false,
            electronWindowsLocation: 'default',
            electronMacLocation: 'default'
        } }), 
    // Also add at root level for compatibility
    electronIsEncryption: false, electronWindowsLocation: 'default', electronMacLocation: 'default' });
// Initialize our app with enhanced config
const myCapacitorApp = new setup_1.ElectronCapacitorApp(enhancedConfig, trayMenuTemplate, appMenuBarMenuTemplate);
// If deeplinking is enabled then we will set it up here.
if ((_a = capacitorFileConfig.electron) === null || _a === void 0 ? void 0 : _a.deepLinkingEnabled) {
    (0, electron_1.setupElectronDeepLinking)(myCapacitorApp, {
        customProtocol: (_b = capacitorFileConfig.electron.deepLinkingCustomProtocol) !== null && _b !== void 0 ? _b : 'mycapacitorapp',
    });
}
// If we are in Dev mode, use the file watcher components.
if (electron_is_dev_1.default) {
    (0, setup_1.setupReloadWatcher)(myCapacitorApp);
}
// Run Application
(async () => {
    // Wait for electron app to be ready.
    await electron_2.app.whenReady();
    // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
    (0, setup_1.setupContentSecurityPolicy)(myCapacitorApp.getCustomURLScheme());
    // Initialize our app, build windows, and load content.
    await myCapacitorApp.init();
    // Check for updates if we are in a packaged app.
    electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
})();
// Handle when all of our windows are close (platforms have their own expectations).
electron_2.app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        electron_2.app.quit();
    }
});
// When the dock icon is clicked.
electron_2.app.on('activate', async function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (myCapacitorApp.getMainWindow().isDestroyed()) {
        await myCapacitorApp.init();
    }
});
// Place all ipc or other electron api calls and custom functionality under this line
