const fs = require('fs');
const path = require('path');
const { spawnSync, exec } = require('child_process');
const installDependencies = require('../core/installDependencies');
const { program } = require('commander');

const existsNodeModules = () => {
  const nodeModulesPath = path.join(process.cwd(), 'src/node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    return !!fs.readdirSync(nodeModulesPath).length;
  }
  return false;
};

const cmdSetup = async () => {
  try {
    if (!existsNodeModules()) {
      await installDependencies();
    }
    program
      .option('--mac', 'build for mac')
      .option('--win', 'build for windows').parse();
    const { mac, win } = program.opts();
    let platform = 'win';
    if (mac) {
      platform = 'mac';
    }
    if (win) {
      platform = 'win';
    }
    const result = spawnSync('electron-builder', [`--${platform}`], {
      cwd: './src',
      stdio: 'inherit'
    });
    if (result.status !== 0) {
      throw new Error('Failed to build');
    }
    exec('rm -rf ./dist');
    const dest = path.join(process.cwd(), 'dist');
    const src = path.join(process.cwd(), 'src/dist');
    console.log(src, 'src');
    console.log(dest, 'dest');
    exec(`mv ${src} ${dest}`)
  } catch (error) {
    throw new Error(error);
  }
};

void cmdSetup();
