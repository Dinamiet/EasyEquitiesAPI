const puppeteer = require('puppeteer');
const path = require('path');

const extractNumber = (currencyString) => {
	// Regular expression to find a floating-point number
	// It looks for:
	// - An optional minus sign at the beginning: -?
	// - One or more digits: \d+
	// - An optional decimal part: (\.\d+)?
	const floatRegex = /-?\d+(\s+\d+)?(\.\d+)?/;

	const match = currencyString.match(floatRegex);

	if (match) {
		return parseFloat(match[0].replace(/\s/, ''));
	}

	return 0;
};

class EasyEquities {
	constructor(username, password) {
		this.authentication = { username: username, password: password };
		this.options = {
			headless: false,
			devtools: true,
		};
		this.browser = null;
	}

	async Initialize() {
		if (this.browser === null) {
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

		page.close();
		return !newUrl.startsWith(loginUrl);
	}

	async GetHoldings(accountID) {
		await this.Initialize();
		const page = await this.browser.newPage();

		await page.goto("https://platform.easyequities.io/AccountOverview");

		const accountTab = `div[data-id='${accountID}']`;
		await page.waitForSelector(accountTab);
		await page.click(accountTab);
		await page.waitForNavigation({ waitUntil: 'networkidle0' });

		await page.waitForSelector("button#loadHoldings");
		await page.click("button#loadHoldings");

		const holdingCellSelector = "div.img-stocks-container > img";
		const purchaseCellSelector = "div.purchase-value-cell > span";
		const currentCellSelector = "div.current-value-cell > span";

		await page.waitForSelector(holdingCellSelector);
		await page.waitForSelector(purchaseCellSelector);
		await page.waitForSelector(currentCellSelector);

		const [holdings, purchases, currents] = await Promise.all([
			page.$$eval(holdingCellSelector, elements => elements.map(element => element.getAttribute('src'))),
			page.$$eval(purchaseCellSelector, elements => elements.map(element => element.textContent)),
			page.$$eval(currentCellSelector, elements => elements.map(element => element.textContent)),
		]);

		const info = holdings.map((symbol, index) => ({
			symbol: path.basename(symbol).split('.')[2],
			purchase: extractNumber(purchases[index]),
			current: extractNumber(currents[index]),
		}));

		page.close();
		return info;
	}
};

module.exports = EasyEquities;
