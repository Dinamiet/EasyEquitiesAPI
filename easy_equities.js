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
};

module.exports = EasyEquities;
