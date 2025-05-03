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

				await page.locator("button#SignIn").click();

				try {
					await page.waitForURL(/.+portfolio-overview.+/);
				} catch {
					page.close();
					return false;
				}

				page.close();
				return true;
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
				await page.locator("button#loadHoldings").click();

				const holdings = [];

				await page.locator("div.holdings-group.table-display").waitFor();
				for (const tableDisplay of await page.locator("div.table-display > div#holding-body-table-positioning").all()) {
					// Expand for more information
					tableDisplay.click();

					const holdingValue = await tableDisplay.locator("div.img-stocks-container > img").getAttribute('src');
					const purchaseValue = await tableDisplay.locator("div.purchase-value-cell > span").textContent();
					const currentValue = await tableDisplay.locator("div.current-value-cell > span").textContent();

					await tableDisplay.locator("div.content-box-description").waitFor();
					const detailsTable = await tableDisplay.locator("div.content-box-description > div.row > div > div.content-box > div.row").all();
					const tableValues = await Promise.all(
						detailsTable.map(row => row.locator("div.bold-heavy").textContent())
					);

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

				try {
					await page.waitForURL(/.+BuyInstruction/);
				}
				catch {
					page.close();
					return false;
				}

				page.close();
				return true;
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
				await page.locator("select#SourceTrustAccountId").selectOption(fromAccount, { force: true });
				await page.locator("select#DestinationTrustAccountId").selectOption(toAccount, { force: true });

				await page.locator("input#TransferAmount").fill(fromAmount.toString());

				await page.locator("input#Agreements_0__Checked").click();

				await page.locator("button[type='submit']").click();

				try {
					await page.waitForURL(/.+FundTransfer.+successfully.+/);
				}
				catch {
					page.close();
					return false;
				}

				page.close();
				return true;
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
