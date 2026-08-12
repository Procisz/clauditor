const { app, BrowserWindow, dialog, Menu, nativeImage } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

const appIcon = nativeImage.createFromPath(path.join(__dirname, '../assets/clauditor-icon.png'))

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Clauditor',
    icon: path.join(__dirname, '../assets/clauditor-icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile(path.join(__dirname, '../dist/Clauditor.html'))

  // Release the reference so the renderer process and all its resources
  // can be garbage-collected immediately after the window closes.
  win.on('closed', () => { win = null })
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        {
          label: 'About Clauditor',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              icon: appIcon,
              title: 'About Clauditor',
              message: `Clauditor`,
              detail: `Version ${app.getVersion()}\n\nClaude Code token usage dashboard.\nAll data stays on your machine.`,
              buttons: ['OK'],
            })
          },
        },
        {
          label: 'Check for Updates…',
          click: async () => {
            if (!app.isPackaged) {
              dialog.showMessageBox({ type: 'info', icon: appIcon, message: 'Update checks are disabled in development.', buttons: ['OK'] })
              return
            }
            try {
              const result = await autoUpdater.checkForUpdates()
              const current = app.getVersion()
              const latest = result?.updateInfo?.version
              if (!latest || latest === current) {
                dialog.showMessageBox({ type: 'info', icon: appIcon, title: 'No updates', message: `You're on the latest version (${current}).`, buttons: ['OK'] })
              }
            } catch {
              dialog.showMessageBox({ type: 'info', icon: appIcon, title: 'No updates', message: `You're on the latest version (${app.getVersion()}).`, buttons: ['OK'] })
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function setupAutoUpdater() {
  // Don't interrupt the user — download silently in the background.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Disable release notes fetching — our markdown notes contain characters
  // (>, emoji) that trip up electron-updater's XML parser.
  autoUpdater.disableWebInstaller = true
  autoUpdater.fullChangelog = false

  autoUpdater.on('update-downloaded', () => {
    if (!win) return
    dialog.showMessageBox(win, {
      type: 'info',
      icon: appIcon,
      title: 'Update ready',
      message: 'A new version of Clauditor has been downloaded.',
      detail: 'It will be installed the next time you quit the app, or you can restart now.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    // Log silently — don't bother the user with update errors.
    console.error('Auto-update error:', err.message)
  })

  // Check once on launch, then every 4 hours.
  autoUpdater.checkForUpdates()
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
}

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  // Skip update checks in development (app is not packaged).
  if (app.isPackaged) setupAutoUpdater()

  app.on('activate', () => {
    if (win === null) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})