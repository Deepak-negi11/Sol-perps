const fs = require('fs');
const path = require('path');

function serializePriceUpdate(feedIdHex, price, exponent, publishTime) {
    const buffer = Buffer.alloc(8 + 32 + 1 + 32 + 8 + 8 + 4 + 8 + 8 + 8 + 8 + 8);
    let offset = 0;

    const discriminator = Buffer.from([2, 55, 172, 194, 219, 150, 241, 169]);
    discriminator.copy(buffer, offset);
    offset += 8;

    // 2. write_authority (32 bytes): all zeros
    const writeAuthority = Buffer.alloc(32);
    writeAuthority.copy(buffer, offset);
    offset += 32;

    // 3. verification_level (1 byte tag for Full: 1)
    buffer.writeUInt8(1, offset);
    offset += 1;

    // 4. price_message: PriceFeedMessage
    // - feed_id (32 bytes)
    const feedId = Buffer.from(feedIdHex, 'hex');
    feedId.copy(buffer, offset);
    offset += 32;

    // - price (i64)
    buffer.writeBigInt64LE(BigInt(price), offset);
    offset += 8;

    // - conf (u64)
    buffer.writeBigUInt64LE(BigInt(1), offset);
    offset += 8;

    // - exponent (i32)
    buffer.writeInt32LE(exponent, offset);
    offset += 4;

    // - publish_time (i64)
    buffer.writeBigInt64LE(BigInt(publishTime), offset);
    offset += 8;

    // - prev_publish_time (i64)
    buffer.writeBigInt64LE(BigInt(publishTime - 10), offset);
    offset += 8;

    // - ema_price (i64)
    buffer.writeBigInt64LE(BigInt(price), offset);
    offset += 8;

    // - ema_conf (u64)
    buffer.writeBigUInt64LE(BigInt(1), offset);
    offset += 8;

    // 5. posted_slot (u64)
    buffer.writeBigUInt64LE(BigInt(100), offset);
    offset += 8;

    return buffer;
}

const feedIdHex = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b50d';
const quoteFeedIdHex = 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a';
const publishTime = Math.floor(Date.now() / 1000) - 2;

const fixtures = [
    {
        pubkey: 'BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc',
        feedId: feedIdHex,
        price: 1000,
        name: 'price_update_open.json'
    },
    {
        pubkey: 'C11dmJTHfjc3AizfTBpnU3DaPvFfywbEZpnN2dKPbU6r',
        feedId: feedIdHex,
        price: 900,
        name: 'price_update_close.json'
    },
    {
        pubkey: '22uBBYZwcKenxnRcn9tcH1hLWNsTfLJTJFvMJUvKqehY',
        feedId: feedIdHex,
        price: 940,
        name: 'price_update_liq.json'
    },
    {
        pubkey: '33uBBYZwcKenxnRcn9tcH1hLWNsTfLJTJFvMJUvKqehY',
        feedId: quoteFeedIdHex,
        price: 1000000,
        name: 'quote_price_update_open.json'
    },
    {
        pubkey: '44uBBYZwcKenxnRcn9tcH1hLWNsTfLJTJFvMJUvKqehY',
        feedId: quoteFeedIdHex,
        price: 1000000,
        name: 'quote_price_update_close.json'
    },
    {
        pubkey: '55uBBYZwcKenxnRcn9tcH1hLWNsTfLJTJFvMJUvKqehY',
        feedId: quoteFeedIdHex,
        price: 1000000,
        name: 'quote_price_update_liq.json'
    }
];

const fixturesDir = path.join(__dirname, 'programs', 'solperp-anchor', 'tests', 'fixtures');
if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
}

fixtures.forEach(f => {
    const dataBuffer = serializePriceUpdate(f.feedId, f.price, -6, publishTime);
    const fixture = {
        pubkey: f.pubkey,
        account: {
            lamports: 1000000000,
            data: [dataBuffer.toString('base64'), 'base64'],
            owner: 'HMHZhN31Q7ERSR2ekrPKbjqYc7icK7eqkoDZ6sEdHzv8',
            executable: false,
            rentEpoch: 0
        }
    };
    fs.writeFileSync(path.join(fixturesDir, f.name), JSON.stringify(fixture, null, 2));
    console.log(`Generated fixture: ${f.name} with price ${f.price}`);
});
