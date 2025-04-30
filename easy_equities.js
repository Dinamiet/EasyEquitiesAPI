const puppeteer = require('puppeteer');

class EasyEquities {
	constructor(username, password) {
		this.authentication = { username: username, password: password };
		this.options = {
			headless: false,
		};
		this.browser = null;
	}

	async Initialize() {
		if (this.browser == null) {
			try {
				this.browser = await puppeteer.launch(this.options);
			} catch (error) {
				console.error("Error initializing browser: " + error);
			}
		}
	}

	async Close() {
		if (!this.browser) {
			return;
		}

		await this.browser.close();
		this.browser = null;
	}

	async Login() {
		await this.Initialize();
		const page = await this.browser.newPage();

		await page.goto('https://platform.easyequities.io/Account/SignIn');

		await page.waitForSelector("form#loginForm");

		await page.waitForSelector("input#user-identifier-input");
		await page.type("input#user-identifier-input", this.authentication.username);

		await page.waitForSelector("input#Password");
		await page.type("input#Password", this.authentication.password);

		const loginUrl = page.url();

		await page.click("button#SignIn");

		await page.waitForNavigation({ waitUntil: 'networkidle0' });

		const newUrl = page.url();

		if (newUrl.startsWith(loginUrl)) {
			return false;
		}

		return true;
	}
};

module.exports = EasyEquities;
