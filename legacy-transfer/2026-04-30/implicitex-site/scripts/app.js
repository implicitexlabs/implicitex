// MetaMask + Ethers.js Wallet Connect
const connectButton = document.getElementById('connectButton');
const walletAddress = document.getElementById('walletAddress');

async function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            // Request account access
            const accounts = await provider.send("eth_requestAccounts", []);
            const address = accounts[0];
            walletAddress.textContent = `Connected: ${address}`;
            // Optionally: style address to fit your theme
        } catch (err) {
            walletAddress.textContent = "Connection failed or rejected.";
            console.error(err);
        }
    } else {
        walletAddress.innerHTML = `MetaMask not detected.<br><a href='https://metamask.io/download.html" target="_blank" style="color:#FF8B4B">Install MetaMask</a>`;
    }
}
connectButton.addEventListener('click', connectWallet);

//Optional: Learn More button event
document.getElementById('learnMore').onclick = () => {
    window.open("https://implicitex.com/about", "_blank");
};