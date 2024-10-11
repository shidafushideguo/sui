import { SuiMaster } from 'suidouble';
import config from './config.js';
import Miner from './includes/Miner.js';
import FomoMiner from './includes/fomo/FomoMiner.js';

import CSwap from './swap.js'

const run = async () => {
    const phrase = config.phrase;
    const chain = config.chain;

    if (!config.phrase || !config.chain) {
        throw new Error('phrase and chain parameters are required');
    }

    const suiMasterParams = {
        client: chain,
        debug: !!config.debug,
    };
    if (phrase.indexOf('suiprivkey') === 0) {
        suiMasterParams.privateKey = phrase;
    } else {
        suiMasterParams.phrase = phrase;
    }
    const suiMaster = new SuiMaster(suiMasterParams);
    await suiMaster.initialize();

    console.log('suiMaster connected as ', suiMaster.address);

    const miners = {};

    const doMine = async (minerInstance) => {

        setInterval(() => {


            console.log(`当前最低挖矿金额：${minerInstance.minPrice} 进入获取价格`)
            CSwap.getPrice().then(e => {
                let minPrice = parseFloat(e) * 1.1;
                minerInstance.minPrice = parseFloat(minPrice);
            });


            // 获取当前的余额
            minerInstance._suiMaster._client.getBalance({
                owner: minerInstance._suiMaster.address,
                coinType: "0xa340e3db1332c21f20f5c08bef0fa459e733575f9a7e2f5faca64f72cd5a54f2::fomo::FOMO",
                limit: 1
            }).then(e => {
                minerInstance.totalBalanceFomo = e.totalBalance;
                minerInstance.coinObjectCount = e.coinObjectCount;
            });


        }, 5000)



        while (true) {
            try {
                console.log("当前FOMO对象：" + minerInstance.coinObjectCount)
                if (parseFloat(minerInstance.coinObjectCount) > 30) {
                    console.log("对象大于30次触发")
                    await CSwap.swapFomo(minerInstance.totalBalanceFomo, minerInstance._suiMaster.address, minerInstance._suiMaster._signer);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    let e = await minerInstance._suiMaster._client.getBalance({
                        owner: minerInstance._suiMaster.address,
                        coinType: "0xa340e3db1332c21f20f5c08bef0fa459e733575f9a7e2f5faca64f72cd5a54f2::fomo::FOMO",
                        limit: 1
                    });
                    minerInstance.totalBalanceFomo = e.totalBalance;
                    minerInstance.coinObjectCount = e.coinObjectCount;
                }

                await minerInstance.mine();
            } catch (e) {
                console.error(e);
                console.log('restarting the miner instance...');
            }
            await new Promise((res) => setTimeout(res, 100));
        };
    };


    if (config.do.meta) {
        const miner = new Miner({
            suiMaster,
            packageId: config.packageId,
            blockStoreId: config.blockStoreId,
            treasuryId: config.treasuryId,
        });
        miners.meta = miner;
        doMine(miners.meta);
    };
    if (config.do.fomo) {
        const fomoMiner = new FomoMiner({
            suiMaster,
            packageId: config.fomo.packageId,
            configId: config.fomo.configId,
            buses: config.fomo.buses,
        });
        miners.fomo = fomoMiner;
        doMine(miners.fomo);
    };



    // // let i = 0;
    // // let balance = null;

    // while (true) {
    //     // await miner.printAdjustDifficultyEvents();
    //     await miner.mine();
    //     i = i + 1;
    //     // balance = await miner.getBTCBalance();
    //     // console.log('BTC balance: ', balance);

    //     // await miner.printAdjustDifficultyEvents();
    // }
};

run()
    .then(() => {
        console.error('running');
    });