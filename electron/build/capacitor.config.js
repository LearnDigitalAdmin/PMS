"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    appId: 'com.plotyangu.app',
    appName: 'Plot Yangu',
    webDir: 'dist',
    plugins: {
        SplashScreen: {
            launchShowDuration: 3000,
            launchAutoHide: true,
            launchFadeOutDuration: 3000,
            backgroundColor: "#ffffffff",
            androidSplashResourceName: "splash",
            androidScaleType: "CENTER_CROP",
            showSpinner: true,
            androidSpinnerStyle: "large",
            iosSpinnerStyle: "small",
            spinnerColor: "#018424ff",
            splashFullScreen: true,
            splashImmersive: true,
            layoutName: "launch_screen",
            useDialog: true,
        },
        '@capacitor-community/electron': {
            windowOptions: {
                width: 1200,
                height: 800,
                minWidth: 1000,
                minHeight: 600,
                webPreferences: {
                    webSecurity: false,
                    nodeIntegration: false,
                    contextIsolation: true
                }
            },
            deepLinkingEnabled: false,
            deepLinkingCustomProtocol: 'plotyangu'
        },
        CapacitorSQLite: {
            electronIsEncryption: false,
            electronWindowsLocation: 'default',
            electronMacLocation: 'default'
        }
    }
};
exports.default = config;
