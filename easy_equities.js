const playwright = require('playwright');
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
			headless: true,
			devtools: false,
		};
		this.browser = null;
		this.maxRetries = 3;
	}

	async Initialize() {
		if (this.browser === null) {
			try {
				this.browser = await playwright.firefox.launch(this.options);
				this.context = await this.browser.newContext();
			} catch (error) {
				console.error("Error initializing browser: " + error);
			}
		}
	}

	async Close() {
		if (this.context) {
			await this.context.close();
			this.context = null;
		}

		if (this.browser) {
			await this.browser.close();
			this.browser = null;
		}
	}

	async Login() {
		await this.Initialize();
		const page = await this.context.newPage();

		await page.goto('https://platform.easyequities.io/Account/SignIn');

		let retries = this.maxRetries;
		while (retries > 0) {
			try {
				await page.locator("input#user-identifier-input").fill(this.authentication.username);
				await page.locator("input#Password").fill(this.authentication.password);

				const loginUrl = page.url();

				await page.locator("button#SignIn").click();

				const newUrl = page.url();

				page.close();

				return !newUrl.startsWith(loginUrl);
			} catch (error) {
				retries--;
				console.log("Something went wrong, retrying...");
				if (retries === 0)
					throw new Error(`Failed to get login after ${this.maxRetries} retries: ${error.message}`);
			}
		}
	}

	async SelectAccount(accountID) {
		await this.Initialize();
		const page = await this.context.newPage();

		await page.goto("https://platform.easyequities.io/AccountOverview");

		let retries = this.maxRetries;
		while (retries > 0) {
			try {
				const selectedAccount = await page.locator("h3 > span.bold-heavy").evaluate(element => element.textContent);
				if (selectedAccount.includes(accountID))
					return page;

				await page.locator(`div[data-id='${accountID}']#selector-tab`).click();

				await page.locator(`div[data-id='${accountID}']#trustaccount-slider`).waitFor();
			} catch (error) {
				retries--;
				console.log("Something went wrong, retrying...");
				if (retries === 0)
					throw new Error(`Failed to get holdings for ${accountID} after ${this.maxRetries} retries: ${error.message}`);
			}
		}
	}

	async GetHoldings(accountID) {
		await this.Initialize();
		const page = await this.SelectAccount(accountID);

		let retries = this.maxRetries;
		while (retries > 0) {
			try {

				const holdingButtonSelector = "button#loadHoldings";
				await page.waitForSelector(holdingButtonSelector);
				await page.click(holdingButtonSelector);

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
			} catch (error) {
				retries--;
				console.log("Something went wrong, retrying...");
				if (retries === 0)
					throw new Error(`Failed to get holdings for ${accountID} after ${this.maxRetries} retries: ${error.message}`);
			}
		}
	}

	async GetBalance(accountID) {
		await this.Initialize();
		const page = await this.SelectAccount(accountID);

		let retries = this.maxRetries;
		while (retries > 0) {
			try {
				const availableFunds = await page.locator(`div[data-id='${accountID}'] > div.funds-to-invest > div.bold-heavy`).evaluate(element => element.textContent);

				page.close();

				return extractNumber(availableFunds);
			} catch (error) {
				retries--;
				console.log("Something went wrong, retrying...");
				if (retries === 0)
					throw new Error(`Failed to get balance of ${accountID} after ${this.maxRetries} retries: ${error.message}`);
			}
		}
	}

	async Buy(accountID, holding, amount) {
		await this.Initialize();
		const page = await this.SelectAccount(accountID);

		let retries = this.maxRetries;
		while (retries > 0) {
			try {
				await page.goto("https://platform.easyequities.io/ValueAllocation/Buy?contractCode=" + holding);

				await page.locator("input#js-value-amount").fill(amount.toString());

				const performTradeSelector = "div[data-bind*=performTradeOperation]";
				await page.locator(performTradeSelector).click();

				await page.locator(performTradeSelector).click();

				const newUrl = page.url();

				page.close();

				return newUrl.includes("BuyInstruction");
			} catch (error) {
				retries--;
				console.log("Something went wrong, retrying...");
				if (retries === 0)
					throw new Error(`Failed to buy ${holding} after ${this.maxRetries} retries: ${error.message}`);
			}
		}
	}

	async Transfer(fromAccount, toAccount, fromAmount) {
		await this.Initialize();
		const page = await this.context.newPage();

		await page.goto("https://platform.easyequities.io/FundTransfer/Transfer");

		let retries = this.maxRetries;
		while (retries > 0) {
			try {
				const sourceSelector = "select#SourceTrustAccountId";
				await page.waitForSelector(sourceSelector, { state: 'attached' });
				await page.selectOption(sourceSelector, fromAccount, { force: true });

				const destinationSelector = "select#DestinationTrustAccountId";
				await page.waitForSelector(destinationSelector, { state: 'attached' });
				await page.selectOption(destinationSelector, toAccount, { force: true });

				const transferAmountSelector = "input#TransferAmount";
				await page.waitForSelector(transferAmountSelector);
				await page.fill(transferAmountSelector, fromAmount.toString());

				const agreementSelector = "input#Agreements_0__Checked";
				await page.waitForSelector(agreementSelector);
				await page.click(agreementSelector);

				const transferButtonSelector = "button[type='submit']";
				await page.waitForSelector(transferButtonSelector);
				await page.click(transferButtonSelector);

				const newUrl = page.url();

				page.close();

				return newUrl.includes("successfully");
			} catch (error) {
				retries--;
				console.log("Something went wrong, retrying...");
				if (retries === 0)
					throw new Error(`Failed to get transfer ${fromAmount} from account ${fromAccount} to account ${toAccount} after ${this.maxRetries} retries: ${error.message}`);
			}
		}
	}
};

module.exports = EasyEquities;
