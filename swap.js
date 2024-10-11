import { CetusClmmSDK, Percentage, d, adjustForSlippage } from '@cetusprotocol/cetus-sui-clmm-sdk'
import BN from 'bn.js';

const mainnet = {
    fullRpcUrl: 'https://fullnode.mainnet.sui.io',
    swapCountUrl: 'https://api-sui.cetus.zone/v2/sui/swap/count',
    simulationAccount: {
        address: '0x0a687ee23bba223329e9439dab8ad9e95d02c8a85f838118031959ada024135b' // 必须有这个要不估算会报错
    },
    cetus_config: {
        package_id: '0x95b8d278b876cae22206131fb9724f701c9444515813042f54f0a426c9a3bc2f',
        published_at: '0x95b8d278b876cae22206131fb9724f701c9444515813042f54f0a426c9a3bc2f',
        config: {
            coin_list_id: '0x8cbc11d9e10140db3d230f50b4d30e9b721201c0083615441707ffec1ef77b23',
            launchpad_pools_id: '0x1098fac992eab3a0ab7acf15bb654fc1cf29b5a6142c4ef1058e6c408dd15115',
            clmm_pools_id: '0x15b6a27dd9ae03eb455aba03b39e29aad74abd3757b8e18c0755651b2ae5b71e',
            admin_cap_id: '0x39d78781750e193ce35c45ff32c6c0c3f2941fa3ddaf8595c90c555589ddb113',
            global_config_id: '0x0408fa4e4a4c03cc0de8f23d0c2bbfe8913d178713c9a271ed4080973fe42d8f',
            coin_list_handle: '0x49136005e90e28c4695419ed4194cc240603f1ea8eb84e62275eaff088a71063',
            launchpad_pools_handle: '0x5e194a8efcf653830daf85a85b52e3ae8f65dc39481d54b2382acda25068375c',
            clmm_pools_handle: '0x37f60eb2d9d227949b95da8fea810db3c32d1e1fa8ed87434fc51664f87d83cb'
        }
    },
    clmm_pool: {
        package_id: '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb',
        published_at: '0x70968826ad1b4ba895753f634b0aea68d0672908ca1075a2abdf0fc9e0b2fc6a',
        config: {
            pools_id: '0xf699e7f2276f5c9a75944b37a0c5b5d9ddfd2471bf6242483b03ab2887d198d0',
            global_config_id: '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f',
            global_vault_id: '0xce7bceef26d3ad1f6d9b6f13a953f053e6ed3ca77907516481ce99ae8e588f2b',
            admin_cap_id: '0x89c1a321291d15ddae5a086c9abc533dff697fde3d89e0ca836c41af73e36a75',
            partners_id: '0xac30897fa61ab442f6bff518c5923faa1123c94b36bd4558910e9c783adfa204'
        }
    },
    integrate: {
        package_id: '0x996c4d9480708fb8b92aa7acf819fb0497b5ec8e65ba06601cae2fb6db3312c3',
        published_at: '0x6f5e582ede61fe5395b50c4a449ec11479a54d7ff8e0158247adfda60d98970b'
    },
    deepbook: {
        package_id: '0x000000000000000000000000000000000000000000000000000000000000dee9',
        published_at: '0x000000000000000000000000000000000000000000000000000000000000dee9'
    },
    deepbook_endpoint_v2: {
        package_id: '0x0dd416959739e1db3a4c6f9cac7f9e7202678f3b067d6d419e569a124fc35e0e',
        published_at: '0x0dd416959739e1db3a4c6f9cac7f9e7202678f3b067d6d419e569a124fc35e0e'
    },
    aggregatorUrl: 'https://api-sui.cetus.zone/router'
}

const mainnetSDK = new CetusClmmSDK(mainnet)



/**
 * 通过这个过滤出所有FOMO:SUI得交易对
 */
async function retrievelAllPools() {
    // If you want to get all pools, just pass one empty array.
    const pools = await mainnetSDK.Pool.getPoolsWithPage([])
    console.log(`pool length: ${pools.length}`)
    const coinA = "0xa340e3db1332c21f20f5c08bef0fa459e733575f9a7e2f5faca64f72cd5a54f2::fomo::FOMO"
    const coinB = '0x2::sui::SUI'
    const pool = pools.filter((p) =>
        (p.coinTypeB.toLocaleLowerCase() == coinB.toLocaleLowerCase() && p.coinTypeA.toLocaleLowerCase() == coinA.toLocaleLowerCase()) ||
        (p.coinTypeB.toLocaleLowerCase() == coinA.toLocaleLowerCase() && p.coinTypeA.toLocaleLowerCase() == coinB.toLocaleLowerCase()));

    console.log(pool)
}


// await retrievelAllPools()

// 0x27480fb5acf25f5b17ee8037d80c61e11b9f9c3a2551a39b27d7a009d9781edc
// 0x57cf9ec11cda6d3f9d7dedce74e1d16ce5972035ad72e476e8fb8348a3218e30
// 0xdbf66a55c1c4054b4d2dda7f410a1aa875a9ae149643a15bd8863032bcc2395f


const getPrice = async (sendAmount = 0.001) => {

    const pool = await mainnetSDK.Pool.getPool(
        "0xdbf66a55c1c4054b4d2dda7f410a1aa875a9ae149643a15bd8863032bcc2395f" // One of the pool from Cetus on Sui testnet
    );

    const a2b = false;
    const byAmountIn = true;

    // amount to be traded
    const amount = new BN(sendAmount * 10 ** 9);
    // slippage value
    const slippage = Percentage.fromDecimal(d(2));
    // console.log(pool)
    const swapTicks = await mainnetSDK.Pool.fetchTicks({
        pool_id: pool.poolAddress,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
    });

    // console.log("SwapTicks data:\n", swapTicks);
    const res = mainnetSDK.Swap.calculateRates({
        decimalsA: 2,
        decimalsB: 9,
        a2b,
        byAmountIn,
        amount,
        swapTicks,
        currentPool: pool,
    });

    // console.log("calculateRates###res###", {
    //     estimatedAmountIn: res.estimatedAmountIn.toString(),
    //     estimatedAmountOut: res.estimatedAmountOut.toString(),
    //     estimatedEndSqrtPrice: res.estimatedEndSqrtPrice.toString(),
    //     estimatedFeeAmount: res.estimatedFeeAmount.toString(),
    //     isExceed: res.isExceed,
    //     extraComputeLimit: res.extraComputeLimit,
    //     amount: res.amount.toString(),
    //     aToB: res.aToB,
    //     byAmountIn: res.byAmountIn,
    // });

    const toAmount = byAmountIn
        ? res.estimatedAmountOut
        : res.estimatedAmountIn;
    const amountLimit = adjustForSlippage(toAmount, slippage, !byAmountIn);

    console.log("能交换::" + parseFloat(amountLimit.toString()) / 100);

    return new Promise((resolve) => {
        resolve(amountLimit.toString());
    })

}



const swapFomo = async (sendAmount, address, signer) => {

    mainnetSDK.senderAddress = address;

    const pool = await mainnetSDK.Pool.getPool(
        "0xdbf66a55c1c4054b4d2dda7f410a1aa875a9ae149643a15bd8863032bcc2395f" // One of the pool from Cetus on Sui testnet
    );

    const a2b = true;
    const byAmountIn = true;

    // amount to be traded
    const amount = new BN(sendAmount);
    // slippage value
    const slippage = Percentage.fromDecimal(d(2));
    // console.log(pool)
    const swapTicks = await mainnetSDK.Pool.fetchTicks({
        pool_id: pool.poolAddress,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
    });

    // console.log("SwapTicks data:\n", swapTicks);
    const res = mainnetSDK.Swap.calculateRates({
        decimalsA: 2,
        decimalsB: 9,
        a2b,
        byAmountIn,
        amount,
        swapTicks,
        currentPool: pool,
    });

    console.log("calculateRates###res###", {
        estimatedAmountIn: res.estimatedAmountIn.toString(),
        estimatedAmountOut: res.estimatedAmountOut.toString(),
        estimatedEndSqrtPrice: res.estimatedEndSqrtPrice.toString(),
        estimatedFeeAmount: res.estimatedFeeAmount.toString(),
        isExceed: res.isExceed,
        extraComputeLimit: res.extraComputeLimit,
        amount: res.amount.toString(),
        aToB: res.aToB,
        byAmountIn: res.byAmountIn,
    });

    const toAmount = byAmountIn
        ? res.estimatedAmountOut
        : res.estimatedAmountIn;
    const amountLimit = adjustForSlippage(toAmount, slippage, !byAmountIn);

    console.log("卖出FOMO的话能卖出" + parseFloat(amountLimit.toString()) / 10 ** 9);

    const swapPayload = await mainnetSDK.Swap.createSwapTransactionPayload({
        pool_id: pool.poolAddress,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
        a2b,
        by_amount_in: byAmountIn,
        amount: res.amount.toString(),
        amount_limit: amountLimit.toString(),
    });

    if (signer) {
        const transferTxn = await mainnetSDK.fullClient.sendTransaction(
            signer,
            swapPayload
        );
        console.log("swap: ", transferTxn);
    } else {
        console.log("issue with signer");
    }

    return;
}


export default { getPrice, swapFomo };