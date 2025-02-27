const inquirer = require('inquirer').default;
const { spawn } = require('child_process');

const mirrors = {
  npm: 'https://registry.npmjs.org/',
  taobao: 'https://registry.npmmirror.com/',
  tencent: 'https://mirrors.cloud.tencent.com/npm/'
}

const installDependencies = async () => {
  try {
    const a = await inquirer.prompt([
      {
        type: 'list',
        name: 'mirror',
        message: 'Please select npm mirror',
        choices: [
          {
            name: 'npm',
            value: 'npm'
          },
          {
            name: 'taobao',
            value: 'taobao'
          },
          {
            name: 'tencent',
            value: 'tencent'
          }
        ],
        default: 'npm'
      }
    ])
    const mirror = mirrors[a.mirror];
    const child = spawn('npm', ['install', `--registry=${mirror}`], {
      cwd: './src',
      stdio: 'inherit',
      detached: true
    });
    // child.on('spawn')
    process.on('SIGINT', () => {
      process.kill(child.pid, 'SIGINT')
      process.exit(1);
    });
    child.on('close', (code) => {
      if (code === 0){
        return Promise.resolve('ok');
      }
      if (code !== 0) {
        return Promise.reject(new Error('install dependencies failed'));
      }
    });
  } catch (error) {
    return Promise.reject(error);
  }
};

module.exports = installDependencies;
