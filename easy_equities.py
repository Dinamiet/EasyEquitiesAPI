from requests import Session, get
import urllib.parse
from bs4 import BeautifulSoup
from os import path

class EasyEquities:
	def __init__(self):
		self.baseURL = "https://platform.easyequities.io"
		self.currentAccount = ""
		self.session = Session()

	def login(self, username, password):
		user = urllib.parse.quote(username)
		pw = urllib.parse.quote(password)
		data = (
				f"UserIdentifier={user}&Password={pw}"
				"&ReturnUrl=&OneSignalGameId=&IsUsingNewLayoutSatrixOrEasyEquitiesMobileApp=False"
		)
		self.session.headers["Accept"] = (
			"text/html,application/xhtml+xml,"
			"application/xml;q=0.9,image/webp,*/*;q=0.8"
		)
		self.session.headers["Connection"] = "keep-alive"
		self.session.headers["Connection-Type"] = "application/x-www-form-urlencoded"
		self.session.headers["Content-Type"] = "application/x-www-form-urlencoded"

		response = self.session.post(
			url=self.baseURL + "/Account/SignIn",
			data=data,
			allow_redirects=False
		)
		if (response.status_code != 302):
			print("Login Failed")
			return False

		return True

	def switchAccount(self, accountID):
		if (self.currentAccount == accountID):
			return True

		data = {"trustAccountId": accountID}
		response = self.session.post(
			url=self.baseURL + "/Menu/UpdateCurrency",
			data=data
		)
		if (response.status_code != 200):
			print("Could not select account", accountID)
			return False

		self.currentAccount = accountID
		return True

	def getHoldings(self, accountID):
		if not self.switchAccount(accountID):
			return []

		# Get holdings
		response = self.session.get(url=self.baseURL + "/AccountOverview/GetHoldingsView")
		if (response.status_code != 200):
			print("Could not get holdings")
			return []

		# Parse data
		soup = BeautifulSoup(response.content, "html.parser")
		holding_divs= soup.find_all(attrs={"id": "holding-body-table-positioning"})
		holdings= []
		for holding_div in holding_divs:
			imageURL= holding_div.find(name="img").attrs.get("src")
			image = path.basename(imageURL)
			symbol= image.split(".")[-2]

			purchase_div = holding_div.find(name="div", attrs={"class": "purchase-value-cell"})
			span = purchase_div.find(name="span")
			text = span.text
			purchase_value = float(text[1:].replace(" ", ""))

			current_div = holding_div.find(name="div", attrs={"class": "current-value-cell"})
			span = current_div.find(name="span")
			text = span.text
			current_value = float(text[1:].replace(" ", ""))

			holding = {"symbol": symbol, "purchase_value": purchase_value, "current_value": current_value}
			holdings.append(holding)

		return holdings

	def getBalance(self, accountID):
		if not self.switchAccount(accountID):
			return 0;

		# Get balance
		response = self.session.get(url= self.baseURL + "/AccountOverview")
		if (response.status_code != 200):
			print("Could not get Account overview")
			return 0

		# Parse data
		soup = BeautifulSoup(response.content, "html.parser")
		availableFunds_div = soup.find(attrs={"class": "funds-to-invest"})
		span = availableFunds_div.find(name="span")
		text = span.text
		availableFunds = float(text[1:].replace(" ", ""))
		return availableFunds

	def buy(self, accountID, holding, value):
		if not self.switchAccount(accountID):
			return False

		# Get holding page
		response = self.session.get(url= self.baseURL + "/ValueAllocation/Buy?contractCode=" + holding)
		if (response.status_code != 200):
			print("Could not get Buy page")
			return False

		# Parse data
		soup = BeautifulSoup(response.content, "html.parser")
		form = soup.find(name="form", attrs={"id": "valueAllocationForm"})
		action = form.attrs["action"]
		inputs = form.find_all(name="input")
		postData = {}
		for formInput in inputs:
			name = formInput.attrs["name"]
			value = formInput.attrs["value"]
			if (name == "TradeValue"):
				postData[name] = str(amount)
				continue
			elif (name == "Risk"):
				continue
			postData[name] = value

		# Place order
		response = self.session.post(
			url= self.baseURL+action,
			data=postData
		)
		if (response.status_code != 200):
			print("Could not place order")
			return False

		return True

	def transfer(self, fromAccount, toAccount, fromAmount):
		# Get Transfer page
		response = self.session.get(url= self.baseURL +  "/FundTransfer/Transfer")
		if (response.status_code != 200):
			print("Could not get Transfer page")
			return False

		# Parse data
		soup = BeautifulSoup(response.content, "html.parser")
		form = soup.find(name="form")
		action= form.attrs["action"]
		inputs = form.find_all(name="input")
		postData  = {}
		for formInput in inputs:
			if "name" in formInput.attrs:
				name  = formInput.attrs["name"]
				value = formInput.attrs["value"]
				postData[name] = value

		postData['TransferAmount'] = fromAmount
		postData['SourceTrustAccountId'] = fromAccount
		postData['DestinationTrustAccountId'] = toAccount
		postData['ConfirmAgreement'] = 'true'

		response = self.session.post(
			url= self.baseURL+action,
			data=postData
		)
		if (response.status_code != 200):
			print("Could not transfer funds")
			return False

		return True
