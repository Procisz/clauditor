const { app, BrowserWindow, dialog, Menu, nativeImage } = require('electron')
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

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (win === null) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})