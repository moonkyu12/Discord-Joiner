const fs = require('fs');
const readline = require('readline');
const puppeteer = require('puppeteer');
const { Client } = require('discord.js-selfbot-v13');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (query) => new Promise((resolve) => rl.question(`>| ${query}`, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function printGradationTitle() {
  const asciiArt = [
    String.raw`_____________                        _________   _________   _____                   `,
    String.raw`___  __ \__(_)_______________________________  /   ______  /________(_)___________________`,
    String.raw`__  / / /_  /__  ___/  ___/  __ \_  ___/  __  /    ___ _  /_  __ \_  /__  __ \  _ \_  ___/`,
    String.raw`_  /_/ /_  / _(__  )/ /__ / /_/ /  /   / /_/ /     / /_/ / / /_/ /  / _  / / /  __/  /    `,
    String.raw`/_____/ /_/  /____/ \___/ \____//_/    \__,_/      \____/  \____//_/  /_/ /_/\___//_/     `,
    String.raw`by : moonkyu12`
  ];

  const startColor = { r: 15, g: 76, b: 229 };   // 진한 파란색
  const endColor = { r: 114, g: 217, b: 255 };  // 밝은 하늘색
  const steps = asciiArt.length;

  console.log(""); 
  for (let i = 0; i < steps; i++) {
    const r = Math.round(startColor.r + ((endColor.r - startColor.r) / (steps - 1)) * i);
    const g = Math.round(startColor.g + ((endColor.g - startColor.g) / (steps - 1)) * i);
    const b = Math.round(startColor.b + ((endColor.b - startColor.b) / (steps - 1)) * i);
    
    console.log(`\x1b[38;2;${r};${g};${b}m${asciiArt[i]}\x1b[0m`);
  }
  console.log(""); 
}

async function main() {
  console.clear();
  printGradationTitle();

  if (!fs.existsSync('tokens.txt')) {
    fs.writeFileSync('tokens.txt', '', 'utf-8');
    console.log('Please put the tokens in tokens.txt.');
    process.exit(1);
  }

  const tokens = fs.readFileSync('tokens.txt', 'utf-8')
    .split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  if (tokens.length === 0) {
    console.log('Please put the tokens in tokens.txt.');
    process.exit(1);
  }
  console.log(`\nToken Loading...\n`);
  console.log(`Load of ${tokens.length} Tokens.\n`);

  const inviteInput = await ask('Please enter the server invite code: ');
  const inviteCode = inviteInput.replace(/https:\/\/discord\.gg\//g, '').trim();

  const countInput = await ask('Please enter the number of tokens to use (or "all"): ');

  let targetCount = tokens.length;
  if (countInput.toLowerCase() !== 'all') {
    const parsed = parseInt(countInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      targetCount = Math.min(parsed, tokens.length);
    }
  }

  console.log(`\n${targetCount} Joining...`);
  rl.close();

  for (let i = 0; i < targetCount; i++) {
    const token = tokens[i];
    const displayToken = token.substring(0, 15) + '...';
    console.log(`\n--------------------------------------------`);
    console.log(`[${i + 1}/${targetCount}] token join: ${displayToken}`);

    let joined = false;
    let alreadyInServer = false;

    try {
      const selfbot = new Client();
      const apiResult = await new Promise((resolve, reject) => {
        selfbot.on('ready', async () => {
          try {

            const inviteInfo = await selfbot.fetchInvite(inviteCode).catch(() => null);
            
            if (inviteInfo && inviteInfo.guild) {

              const isMember = selfbot.guilds.cache.has(inviteInfo.guild.id);
              if (isMember) {
                console.log(` └ Already in the server`);
                alreadyInServer = true;
                selfbot.destroy();
                resolve(true);
                return;
              }
            }

            console.log(` └ Attempting to accept invitation...`);
            const invite = await selfbot.acceptInvite(inviteCode);
            console.log(` └ Join successful! Server: [${invite.guild.name}]`);
            selfbot.destroy();
            resolve(true);
          } catch (err) {
            selfbot.destroy();

            if (err.code === 40007 || (err.message && err.message.includes('already'))) {
              console.log(` └ [Already Joined] This token is already joined to the server.`);
              alreadyInServer = true;
              resolve(true);
            } else {
              reject(err);
            }
          }
        });
        selfbot.on('error', () => { selfbot.destroy(); resolve(false); });
        selfbot.login(token).catch(() => resolve(false));
      });

      if (apiResult || alreadyInServer) continue;
    } catch (err) {
      console.log(` └ API join limit or captcha detected.`);
    }
    
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    try {
      const page = await browser.newPage();
      
      await page.goto('https://discord.com/login', { waitUntil: 'networkidle2' });
      
      console.log(` └ Injecting token into session...`);
      await page.evaluate((t) => {
        function login(token) {
          setInterval(() => {
            try {
              document.body.appendChild(document.createElement`iframe`).contentWindow.localStorage.token = `"${token}"`;
            } catch (e) {}
          }, 50);
          setTimeout(() => { location.reload(); }, 2500);
        }
        login(t);
      }, token);

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await sleep(3000); 

      await page.goto(`https://discord.com/invite/${inviteCode}`, { waitUntil: 'networkidle2' });
      await sleep(3000);

      // 브라우저 화면상에서 이미 로그인된 상태로 메인 화면(/channels/)에 들어가 있는지 먼저 검사
      const isAlreadyIn = await page.evaluate(() => window.location.href.includes('/channels/'));
      if (isAlreadyIn) {
        console.log(` └ [Already Joined] Browser check result shows already entered the server.`);
        continue;
      }

      const btnSelector = 'button[type="button"], button';
      const buttons = await page.$$(btnSelector);

      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes('브라우저에서') || text.includes('수락') || text.includes('Accept') || text.includes('참가') || text.includes('계속하기')) {
          await btn.click();
          // console.log(` └ [클릭 완료] 인터페이스 버튼을 트리거했습니다: "${text.trim()}"`); 음....할사람은 알아서 하겠지
          await sleep(2000);
        }
      }

      await sleep(4000);

      for (let check = 0; check < 120; check++) {
        await sleep(5000);
        
        const currentCheck = await page.evaluate(() => {
          const bodyText = document.body.innerText;
          const hasCaptcha = document.querySelector('iframe[src*="captcha"]') || document.querySelector('iframe[title*="hCaptcha"]');
          
          const isSuccess = window.location.href.includes('/channels/');
          const isBanned = bodyText.includes('수락할 수 없음') || bodyText.includes('Unable to accept');
          const hasCaptchaScreen = hasCaptcha || bodyText.includes('사람') || bodyText.includes('인증') || bodyText.includes('Verify');
          
          return { isSuccess, isBanned, hasCaptchaScreen };
        });

        if (currentCheck.isSuccess) {
          console.log(` └ Join success!`);
          joined = true;
          break;
        }

        if (currentCheck.isBanned) {
          console.log(` └ Unable to join.`);
          break;
        }

        if (check === 0 || check % 6 === 0) {
          if (currentCheck.hasCaptchaScreen) {
            console.log(` There is a captcha...`);
          } else {
            console.log(` Please check the pop-ups or buttons on the browser screen.`);
          }
        }
      }

      if (!joined) {
        console.log(` └ Session expiration`);
      } else {
        await sleep(2000);
      }

    } catch (err) {
      console.error(` └ Error controlling browser`, err.message);
    } finally {
      await browser.close().catch(() => {});
      console.log(`[${i + 1}/${targetCount}] Token session ends.`);
    }
  }

  console.log('\n Complete.');
  process.exit(0);
}

process.on('unhandledRejection', () => {});
main();