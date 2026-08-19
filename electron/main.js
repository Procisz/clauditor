const { app, BrowserWindow, dialog, Menu, nativeImage, ipcMain } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs/promises')

const appIcon = nativeImage.createFromPath(path.join(__dirname, '../assets/clauditor-icon.png'))

const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const COWORK_STORE = path.join(app.getPath('appData'), 'Claude', 'local-agent-mode-sessions')
const ROOTS = [CLAUDE_PROJECTS, COWORK_STORE]

function assertAllowed(p) {
  const r = path.resolve(p)
  if (!ROOTS.some(root => r === root || r.startsWith(root + path.sep))) {
    throw new Error('Path outside allowed data roots')
  }
  return r
}

ipcMain.handle('clauditor:paths', () => ({ projects: CLAUDE_PROJECTS, cowork: COWORK_STORE }))
ipcMain.handle('clauditor:list', async (_e, dirPath) => {
  const items = await fs.readdir(assertAllowed(dirPath), { withFileTypes: true })
  return items.map(d => ({ name: d.name, dir: d.isDirectory() }))
})
ipcMain.handle('clauditor:read', async (_e, filePath) => {
  try {
    return await fs.readFile(assertAllowed(filePath), 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
})

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
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.loadFile(path.join(__dirname, '../dist/Clauditor.html'))

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
