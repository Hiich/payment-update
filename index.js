const axios = require('axios'); // require axios library for making HTTP requests
const fs = require('fs');

const ETH_API_KEY = process.env.ETH_SCAN_API_KEY; // replace with your Etherscan API key
const BSC_API_KEY = process.env.BSC_SCAN_API_KEY;
const WALLET_ADDRESS = '0x1d083f0389d81369d3ba657ad8b459b1403cbbfa'; // replace with your Ethereum wallet address
const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const PRICE_PER_USD = 150;
const COLT_PAYMENT_API = 'https://app.collateralnetwork.io/api/payments';
const COLT_CREDITS_API = 'https://app.collateralnetwork.io/api/credits';
const ETH_PRICE = 1600;
const BNB_PRICE = 300;
const ETH_START_BLOCK = 16719801;
const BSC_START_BLOCK = 26059814;

//read argument from command line
const args = process.argv.slice(2);
const testMode = args[0] === 'test';

console.log("Launching script to update credits and payments...")
console.log("Test mode status:", testMode)

const fetchData = async () => {
    // construct the Etherscan API endpoint URL for retrieving all transactions to the wallet address
    const ethUrl =
        `https://api.etherscan.io/api?module=account&action=txlist&address=${WALLET_ADDRESS}&sort=desc&apikey=${ETH_API_KEY}&startblock=${ETH_START_BLOCK}`;
    const usdtUrl =
        `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${USDT_ADDRESS}&address=${WALLET_ADDRESS}&apikey=${ETH_API_KEY}&startblock=${ETH_START_BLOCK}`;

    const bnbUrl =
        `https://api.bscscan.com/api?module=account&action=txlist&address=${WALLET_ADDRESS}&sort=desc&apikey=${BSC_API_KEY}&startblock=${BSC_START_BLOCK}`;

    const coltPaymentUrl = `https://app.collateralnetwork.io/api/allPayments`
    // make a GET request to the API endpoint URL using axios
    const { data: ethTransfers } = await axios.get(ethUrl)
    const { data: usdtTransfers } = await axios.get(usdtUrl)
    const { data: coltTransfers } = await axios.get(coltPaymentUrl)
    const { data: bnbTransfers } = await axios.get(bnbUrl)

    //remove ethtransfers and usdttransfers where from is the wallet address
    if (ethTransfers.status === "1")
        ethTransfers.result = ethTransfers.result.filter((transfer) => transfer.to.toLowerCase() === WALLET_ADDRESS.toLowerCase());
    if (usdtTransfers.status === "1")
        usdtTransfers.result = usdtTransfers?.result.filter((transfer) => transfer.to.toLowerCase() === WALLET_ADDRESS.toLowerCase());
    if (bnbTransfers.status === "1")
        bnbTransfers.result = bnbTransfers.result.filter((transfer) => transfer.to.toLowerCase() === WALLET_ADDRESS.toLowerCase());
    return { ethTransfers, usdtTransfers, bnbTransfers, coltTransfers };
}

const filterTransfers = async () => {
    const { ethTransfers, usdtTransfers, bnbTransfers, coltTransfers } = await fetchData();
    const ethTransfersFiltered = ethTransfers.status === "1" ? ethTransfers.result.filter(
        //check if coltPayments contains the txhash
        (transfer) => !coltTransfers.some(
            (coltTransfer) => coltTransfer.txhash.toLowerCase() === transfer.hash.toLowerCase()
        )
    ) : [];

    const usdtTransfersFiltered = usdtTransfers.status === "1" ? usdtTransfers.result.filter(
        //check if coltPayments contains the txhash
        (transfer) => !coltTransfers.some(
            (coltTransfer) => coltTransfer.txhash.toLowerCase() === transfer.hash.toLowerCase()
        )
    ) : [];

    const bnbTransfersFiltered = bnbTransfers.status === "1" ? bnbTransfers.result.filter(
        //check if coltPayments contains the txhash
        (transfer) => !coltTransfers.some(
            (coltTransfer) => coltTransfer.txhash.toLowerCase() === transfer.hash.toLowerCase()
        )
    ) : [];

    return { ethTransfersFiltered, usdtTransfersFiltered, bnbTransfersFiltered };
}

const main = async () => {
    const { ethTransfersFiltered, usdtTransfersFiltered, bnbTransfersFiltered } = await filterTransfers();
    //generate payments for ethTransfers
    const ethPayments = ethTransfersFiltered.map((transfer) => {
        const amountInUSD = Math.ceil(transfer.value / 1e18 * ETH_PRICE);
        return {
            txhash: transfer.hash,
            wallet: transfer.from,
            amountInUSD: amountInUSD,
            credits: amountInUSD * PRICE_PER_USD,
            currency: 'ETH'
        }
    });

    //generate payments for usdtTransfers
    const usdtPayments = usdtTransfersFiltered.map((transfer) => {
        const value = transfer.value / 1000000;
        return {
            txhash: transfer.hash,
            wallet: transfer.from,
            amountInUSD: value,
            credits: value * PRICE_PER_USD,
            currency: 'USDT'
        }
    })

    //generate payments for bnbTransfers
    const bnbPayments = bnbTransfersFiltered.map((transfer) => {
        const amountInUSD = Math.ceil(transfer.value / 1e18 * BNB_PRICE);
        return {
            txhash: transfer.hash,
            wallet: transfer.from,
            amountInUSD: amountInUSD,
            credits: amountInUSD * PRICE_PER_USD,
            currency: 'BNB'
        }
    })

    const totalPayments = [...ethPayments, ...usdtPayments, ...bnbPayments];
    //write payments to file
    fs.writeFileSync('./logs/payments.json', JSON.stringify(totalPayments, null, 2));

    //if testmode don't update the api
    if (!testMode) {
        //call payment api to create payments
        for (const payment of totalPayments) {
            try {
                const url = `${COLT_PAYMENT_API}/${payment.wallet}`;
                const resp = await axios.post(url, payment);
                console.log(resp.status)
            } catch (error) {
                console.log(error);
            }
        }
    }
    //call credits api to create credits
    const { data: userCredits } = await axios.get(COLT_CREDITS_API);

    //calculate total credits for each user in totalPayments
    const newCredits = userCredits.map((credit) => {
        const payments = totalPayments.filter((payment) => payment.wallet.toLowerCase() === credit.wallet.toLowerCase());
        const totalCredits = payments.reduce((total, payment) => total + payment.credits, 0);
        return {
            wallet: credit.wallet,
            credits: totalCredits
        }
    })

    //add credits to existing credits
    const updatedCredits = userCredits.map((credit) => {
        const newCredit = newCredits.find((newCredit) => newCredit.wallet.toLowerCase() === credit.wallet.toLowerCase());
        return {
            wallet: credit.wallet,
            credits: credit.credits + newCredit.credits
        }
    })

    //write credits to file
    fs.writeFileSync('./logs/credits.json', JSON.stringify(updatedCredits, null, 2));

    //if testmode don't update the api
    if (!testMode) {
        //for each credit update the amount
        for (const credit of updatedCredits) {
            const existingCredit = userCredits.find((c) => c.wallet === credit.wallet);
            if (existingCredit && existingCredit.credits !== credit.credits) {
                const url = `${COLT_CREDITS_API}/${existingCredit._id}`;
                const resp = await axios.post(url, { credits: credit.credits });
                console.log(resp.status);
            }
        }
    }
}

main();
