// --- CONFIGURATION ---
const SUPABASE_URL = 'https://ujlhyugejsgqdtjfejar.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbGh5dWdlanNncWR0amZlamFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTU0NDksImV4cCI6MjA5MTM5MTQ0OX0.IpFfh8RliulIFoU1SiYpf20mQ2XLnFV8HKixaaqoitE';
// We wrap the webhook in a cors proxy so Discord doesn't block the browser request
const DISCORD_WEBHOOK = 'https://corsproxy.io/?' + encodeURIComponent('https://discord.com/api/webhooks/1499684331633905667/o85983SOfWdkvE6qvC4-P7Z3t1rV65KRaTl7EWiCnq5USEpQOYuvu-vut38tEZiY-abi');

// Initialize Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL VARIABLES ---
let validatedOrder = null;
let generatedOrderIdForCopy = "";

// --- SLIDER & PRICING LOGIC ---
const PLANS = [
    { id: "30", label: "30 days", price: 2.00 },
    { id: "60", label: "60 days", price: 3.00 },
    { id: "permanent", label: "Lifetime", price: 4.00 }
];

const slider = document.getElementById("duration-slider");
const durationDisplay = document.getElementById("duration-display");
const priceDisplay = document.getElementById("price-display");

function getSelectedPlan() {
    return PLANS[Number(slider.value)] ?? PLANS[0];
}

function renderPlan() {
    const plan = getSelectedPlan();
    durationDisplay.textContent = plan.label;
    priceDisplay.textContent = plan.price.toFixed(2) + "€";
}

// Update UI when slider moves
slider.addEventListener("input", renderPlan);

// --- CHECKOUT LOGIC ---
document.getElementById("checkout-btn").addEventListener("click", async () => {
    try {
        const plan = getSelectedPlan();
        const orderId = 'ORD-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const priceString = plan.price.toFixed(2);

        // 1. Setup UI for post-checkout
        document.getElementById('store-section').classList.add('hidden');
        document.getElementById('order-generated-section').classList.remove('hidden');
        document.getElementById('display-order-id').innerText = orderId;
        document.getElementById('order-id').value = orderId; // Auto-fill the tracker box
        generatedOrderIdForCopy = orderId;

        // 2. Save Order to Supabase Database
        const { error } = await supabase.from('orders').insert([
            { order_id: orderId, days: plan.id, status: 'pending' }
        ]);
        
        if (error) {
            alert("Database Error: " + error.message);
            return;
        }

        // 3. Send Discord Webhook via Proxy
        fetch(DISCORD_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                content: `🛒 **New Purchase Attempt**\n**Order ID:** \`${orderId}\`\n**Duration:** ${plan.label}\n**Expected:** €${priceString}` 
            })
        }).catch(err => console.log("Webhook sent, ignoring proxy response."));

        // 4. Open PayPal in new tab
        window.open(`https://paypal.me/transfer959/${priceString}`, '_blank');
        
    } catch (err) {
        alert("Checkout Error: " + err.message);
    }
});

// Copy ID Button
document.getElementById("copy-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(generatedOrderIdForCopy);
    alert("Copied: " + generatedOrderIdForCopy);
});


// --- ORDER TRACKING LOGIC ---
function showStatus(text, colorHex) {
    const msgBox = document.getElementById('status-message');
    msgBox.style.color = colorHex;
    msgBox.style.border = `1px solid ${colorHex}`;
    msgBox.style.background = `rgba(0,0,0,0.5)`;
    msgBox.innerText = text;
    msgBox.classList.remove('hidden');
}

document.getElementById("check-status-btn").addEventListener("click", async () => {
    try {
        const orderId = document.getElementById('order-id').value.trim().toUpperCase();
        if (!orderId) { showStatus("Please enter an Order ID.", "#ff3333"); return; }

        showStatus("Checking database...", "#fbbf24");

        const { data, error } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
        const licSection = document.getElementById('license-section');

        if (error || !data) {
            showStatus("Order not found. Check your ID.", "#ff3333");
            licSection.classList.add('hidden');
            return;
        }

        if (data.status === 'authorized') {
            showStatus("Payment Verified! You may now claim your key.", "#4ade80");
            validatedOrder = data;
            licSection.classList.remove('hidden');
        } else if (data.status === 'claimed') {
            showStatus("This order has already been used to claim a key.", "#ff3333");
            licSection.classList.add('hidden');
        } else {
            showStatus("Payment is pending admin verification. Please wait.", "#fbbf24");
            licSection.classList.add('hidden');
        }
    } catch (err) {
        alert("Status check failed: " + err.message);
    }
});


// --- LICENSE GENERATION LOGIC ---
document.getElementById("create-license-btn").addEventListener("click", async () => {
    try {
        if (!validatedOrder) return;
        
        let inputKey = document.getElementById('custom-key').value.trim().replace(/\s+/g, '-').toUpperCase();
        let finalKey = inputKey || 'KAHACK-' + Math.random().toString(36).substr(2, 10).toUpperCase();

        // 1. Insert License into Database
        const { error } = await supabase.from('licenses').insert([{
            key: finalKey, 
            rank: validatedOrder.days 
        }]);

        if (error) {
            showStatus("That custom key is already taken! Try another one.", "#ff3333");
        } else {
            // 2. Lock the order
            await supabase.from('orders').update({ status: 'claimed' }).eq('order_id', validatedOrder.order_id);
            
            // 3. Show Success Screen
            document.getElementById('license-section').innerHTML = `
                <div style="text-align:center;">
                    <h2 style="color:#4ade80; margin-bottom:10px;">SUCCESS!</h2>
                    <p style="font-size:12px; color:#888; margin-bottom:15px;">Your license key is ready to use.</p>
                    <div style="background:#000; border:1px dashed #333; padding:15px; border-radius:6px; margin-bottom:15px;">
                        <div style="color:#fff; font-size:16px; font-weight:bold; letter-spacing:1px;">${finalKey}</div>
                    </div>
                    <p style="font-size:10px; color:#fbbf24;">Please copy this key immediately.</p>
                </div>
            `;
            showStatus("License successfully generated and secured.", "#4ade80");
        }
    } catch (err) {
        alert("License Error: " + err.message);
    }
});

// Run this once when the page loads to set the initial slider text
renderPlan();
