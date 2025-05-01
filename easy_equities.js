const puppeteer = require('puppeteer');
const path = require('path');

const extractNumber = (currencyString) => {
	// Regular expression to find a floating-point number
	// It looks for:
	// - An optional minus sign at the beginning: -?
	// - One or more digits: \d+
	// - An optional decimal part: (\.\d+)?
	const floatRegex = /-?\.?\d+(\s+\d+)?(\.\d+)?/;

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

		const tableDisplaySelector = "div.table-display > div#holding-body-table-positioning";
		await page.waitForSelector(tableDisplaySelector);

		const tableDisplays = await page.$$(tableDisplaySelector);

		const holdings = [];

		for (const tableDisplay of tableDisplays) {

			const holdingCellSelector = "div.img-stocks-container > img";
			const purchaseCellSelector = "div.purchase-value-cell > span";
			const currentCellSelector = "div.current-value-cell > span";
			const tableRowSelector = "div.content-box-description > div.row > div > div.content-box > div.row"
			const tableRowValueSelector = tableRowSelector + " >  div.bold-heavy";

			// Expand for more information
			tableDisplay.click();
			const tableRowContentSelector = "div.content-box-description > div.row > div > div.content-box > div.row";
			await tableDisplay.waitForSelector(tableRowContentSelector);

			const holdingValue = await tableDisplay.$eval(holdingCellSelector, element => element.getAttribute('src'));
			const purchaseValue = await tableDisplay.$eval(purchaseCellSelector, element => element.textContent);
			const currentValue = await tableDisplay.$eval(currentCellSelector, element => element.textContent);
			const tableValues = await tableDisplay.$$eval(tableRowValueSelector, elements => elements.map(element => element.textContent));

			const info = {
				symbol: path.basename(holdingValue).split('.')[2],
				purchaseValue: extractNumber(purchaseValue),
				currentValue: extractNumber(currentValue),
				shares: extractNumber(tableValues[0]) + extractNumber(tableValues[1]),
				avgPurchasePrice: extractNumber(tableValues[2]),
			};

			holdings.push(info);
		}

		page.close();
		return holdings;
	}

	async GetBalance(accountID) {
		await this.Initialize();
		const page = await this.browser.newPage();

		await page.goto("https://platform.easyequities.io/AccountOverview");

		const accountTab = `div[data-id='${accountID}']`;
		await page.waitForSelector(accountTab);
		await page.click(accountTab);
		await page.waitForNavigation({ waitUntil: 'networkidle0' });

		const availableFundsSelector = `div[data-id='${accountID}'] > div.funds-to-invest`;
		await page.waitForSelector(availableFundsSelector);
		const availableFunds = await page.$eval(availableFundsSelector, element => element.textContent);

		page.close();
		return extractNumber(availableFunds);
	}

	async Buy(accountID, holding, amount) {
		await this.Initialize();
		const page = await this.browser.newPage();

		await page.goto("https://platform.easyequities.io/AccountOverview");

		const accountTab = `div[data-id='${accountID}']`;
		await page.waitForSelector(accountTab);
		await page.click(accountTab);
		await page.waitForNavigation({ waitUntil: 'networkidle0' });

		await page.goto("https://platform.easyequities.io/ValueAllocation/Buy?contractCode=" + holding);

		const amountInputSelector = "input#js-value-amount";
		await page.waitForSelector(amountInputSelector);
		await page.type(amountInputSelector, amount.toString());

		const performTradeSelector = "div[data-bind*=performTradeOperation]";
		await page.waitForSelector(performTradeSelector);

		await page.click(performTradeSelector);
		await page.waitForNetworkIdle();
		await page.waitForSelector(performTradeSelector);
		await page.click(performTradeSelector);

		await page.waitForNavigation({ waitUntil: 'networkidle0' });
		const newUrl = page.url();

		page.close();
		return newUrl.includes("BuyInstruction");
	}
};

module.exports = EasyEquities;
