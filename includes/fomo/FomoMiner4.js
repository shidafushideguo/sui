
import suidouble from 'suidouble';
import { bcs } from '@mysten/sui/bcs';
import hasher from 'js-sha3';
// import { spawn, Thread, Worker } from "threads";

import { bytesTou64, bigIntTo32Bytes, u64toBytes } from '../math.js';
import NonceFinder from '../NonceFinder.js';

export default class FomoMiner {
    constructor(params = {}) {
        this._suiMaster = params.suiMaster || null;

        this._buses = params.buses || null;
        this._configId = params.configId || null;
        this._packageId = params.packageId || null;

        // this._blockStore = null; // to be initialized as SuiObject in .checkObjects() initializer
        // this._treasury = null;
        // this._movePackage = null;

        this._nonceFinder = new NonceFinder({ name: 'FOMO' });

        this._config = null;
        this._movePackage = null;

        this.nonceList = [];


        this.isSub = false;
        setInterval(() => {
            this.submitList();
        }, 100)
    }


    async submitList() {

        if (this.nonceList.length > 0) {
            this.isSub = true;
            console.log("提交")
            let nonceObj = this.nonceList.pop();
            await this.submit(nonceObj.nonce, nonceObj.bus, nonceObj.miner);
            this.isSub = false;
        }

    }


    async checkObjects() {
        if (this.__checkObjectsPromise) {
            return await this.__checkObjectsPromise;
        }

        this.__checkObjectsPromiseResolver = null; // to be sure it's executed once async
        this.__checkObjectsPromise = new Promise((res) => { this.__checkObjectsPromiseResolver = res; });

        if (!this._configId || !this._packageId || !this._buses) {
            throw new Error('FOMO | configId, packageId are required');
        }

        const SuiObject = suidouble.SuiObject;

        const config = new SuiObject({
            id: this._configId,
            suiMaster: this._suiMaster,
        });
        // const treasury = new SuiObject({
        //     id: this._treasuryId,
        //     suiMaster: this._suiMaster,
        // });
        this._suiMaster.objectStorage.push(config);
        // this._suiMaster.objectStorage.push(treasury);

        await config.fetchFields(); // get fields from the blockchain

        this._config = config;
        // this._treasury = treasury;

        const movePackage = this._suiMaster.addPackage({
            id: this._packageId,
        });
        await movePackage.isOnChain(); // check the package on the blockchain

        this._movePackage = movePackage;

        this.__checkObjectsPromiseResolver(true); // initialized

        return true;
    }

    async getOrCreateMiner() {
        await this.checkObjects();

        // check for owned objects
        if (this._suiMaster._debug) {
            console.log('FOMO | Trying to find the miner object already registered on the blockchain....');
        }
        const paginated = await this._movePackage.modules.miner.getOwnedObjects({ typeName: 'Miner' });
        let miner = null;
        await paginated.forEach((suiObject) => { miner = suiObject; });

        if (miner) {
            if (this._suiMaster._debug) {
                console.log('FOMO | It is there, id is: ', miner.id);
            }
            return miner;
        }

        console.log('FOMO | Can not find it. Lets register the new one...');

        await this._movePackage.modules.miner.moveCall('register', []);

        console.log('FOMO | Miner succesfully registered');
        await new Promise((res) => { setTimeout(res, 2000); });

        return await this.getOrCreateMiner();
    }

    async fetchBus() {
        await this.checkObjects();
        const randomBusId = this._buses[Math.floor(Math.random() * this._buses.length)];

        // console.log(randomBusId);

        const bus = new (this._suiMaster.SuiObject)({ id: randomBusId, suiMaster: this._suiMaster });
        await bus.fetchFields();

        return bus;
    }

    async hasBlockInfoChanged(oldHash) {
        const miner = await this.getOrCreateMiner();
        const newHash = new Uint8Array(miner.fields.current_hash); // changed on the new block

        // console.log('Current hash: '+newHash);
        if (bytesTou64(oldHash) != bytesTou64(newHash)) {
            return true;
        }
        return false;
    }

    async mine(startNonce = 0) {
        await this.checkObjects();

        let miner = await this.getOrCreateMiner();
        let bus = await this.fetchBus();
        const currentHash = new Uint8Array(miner.fields.current_hash); // changed on the new block
        const signerAddressBytes = bcs.Address.serialize(this._suiMaster.address).toBytes();
        const difficulty = Number(bus.fields.difficulty);
        const difficultyAsTarget = '0x' + (''.padEnd(difficulty * 2, '00').padEnd(64, 'ff'));
        if (parseFloat(bus.fields.reward_rate || 0) < parseFloat(4500000000)) {
            console.log("不够成本了");
            await new Promise(resolve => setTimeout(resolve, 2000));
            return;
        }

        let foundValid = false;
        let preparedHash = this.prepareHash(currentHash, signerAddressBytes);
        let nonce = startNonce || 0;
        const startFindingNonceAt = (new Date()).getTime();

        let isOutdated = false;
        const __checkForOutdatedInterval = setInterval(() => {
            try {
                this.hasBlockInfoChanged(currentHash)
                    .then((changed) => {
                        console.log('FOMO | block hash changed', changed);
                        if (changed) {
                            isOutdated = true;
                            this.nonceList = [];
                            this._nonceFinder.pleaseStop();
                        }
                    })
                    .catch((e) => {
                        console.error(e);
                    });
            } catch (e) {
                console.log(e);
            }
        }, 3000);

        while (!foundValid && !isOutdated) {
            nonce = await this._nonceFinder.findValidNonce(preparedHash, difficultyAsTarget);
            if (nonce !== null) {
                console.log('FOMO | valid nonce ' + nonce + ' found in ' + ((new Date()).getTime() - startFindingNonceAt) + 'ms   ' + "奖励：" + bus.fields.reward_rate);
                if (parseFloat(bus.fields.reward_rate || 0) < parseFloat(4500000000)) {
                    console.log("奖励不够成本" + bus.fields.reward_rate)
                    foundValid = true;
                } else {
                    this.nonceList.push({
                        nonce, bus, miner
                    })
                }
            }
            foundValid = true;
        };

        clearInterval(__checkForOutdatedInterval);

        return true;
    }

    async prepare() {
        await this.checkObjects();

        const miner = await this.getOrCreateMiner();
        const currentHash = new Uint8Array(miner.fields.current_hash); // changed on the new block
        let startNonce = BigInt(0);
        const signerAddressBytes = bcs.Address.serialize(this._suiMaster.address).toBytes();


        let bus = await this.fetchBus();
        console.log(signerAddressBytes);
        console.log(currentHash);
        console.log(miner.fields.current_hash);

        const difficulty = Number(bus.fields.difficulty);
        console.log(difficulty);

        const difficultyAsTarget = '0x' + (''.padEnd(difficulty * 2, '00').padEnd(64, 'ff'));
        console.log(difficultyAsTarget);

        // const hash = this.createHash(currentHash, signerAddressBytes, startNonce);
        // const hashIsValid = this.validateHash(hash, difficulty);

        // console.log(hash);
        // console.log(hashIsValid);

        console.log(this.busIsOk(bus));

        // let found = false;
        // while(!found) {
        //     const hash = this.createHash(currentHash, signerAddressBytes, startNonce);
        //     const hashIsValid = this.validateHash(hash, difficulty);

        //     console.log(startNonce, hashIsValid);
        //     if (hashIsValid) {
        //         found = true;
        //     }

        //     startNonce = startNonce + 1n;
        // }

        const preparedHash = this.prepareHash(currentHash, signerAddressBytes);
        let nonce = await this._nonceFinder.findValidNonce(preparedHash, difficultyAsTarget);
        console.log(nonce);

        if (nonce) {
            this.submit(nonce, bus, miner);
        }
    }

    busIsOk(bus) {
        const epochLength = 60000;
        const fundsOk = BigInt(bus.fields.rewards) >= BigInt(bus.fields.reward_rate);
        const threshold = Number(bus.fields.last_reset) + epochLength;

        const buffer = 4000;
        const resetTimeOk = Date.now() < threshold - buffer;

        return resetTimeOk && fundsOk;
    }

    async submit(nonce, bus, miner) {

        // await this.checkObjects();

        // if (!meta) {
        //     meta = new Uint8Array([]);
        // }
        // if (!payload) {
        //     payload = new Uint8Array([]);
        // }


        const tx = new suidouble.Transaction();
        const args = [
            tx.pure('u64', nonce),
            tx.object(bus.id), // bus
            tx.object(miner.id), // miner
            tx.object('0x0000000000000000000000000000000000000000000000000000000000000006'), // clock
            // tx.object(this._treasury.id),
            // suidouble.txInput(tx, 'vector<u8>', Array.from(meta)),
            // suidouble.txInput(tx, 'vector<u8>', Array.from(payload)),
            // suidouble.txInput(tx, 'u64', nonce),
            // tx.object(this._suiMaster.address),
        ];


        const moveCallResult = tx.moveCall({
            target: `${this._packageId}::fomo::mine`,
            arguments: args
        });

        tx.transferObjects([moveCallResult], this._suiMaster.address);

        try {
            let bus = await this.fetchBus();
            if (parseFloat(bus.fields.reward_rate || 0) < parseFloat(4500000000)) {
                console.log("不够成本了");
                this.nonceList = [];
                return true;
            }
            const timerLabel = `TransactionExecutionTime_${Date.now()}`;
            console.time(timerLabel);
            const transactionPromise = this._suiMaster.signAndExecuteTransaction({
                // const r = await this._suiMaster.signAndExecuteTransaction({
                transaction: tx,
                // requestType: 'WaitForLocalExecution',
                requestType: 'WaitForEffectsCert',
                sender: this._suiMaster.address,
                options: {
                    "showEffects": false, // @todo: remove?
                    "showEvents": false, // @todo: remove?
                    "showObjectChanges": false,
                    showType: false,
                    showContent: false,
                    showOwner: false,
                    showDisplay: false,
                },
            });
            // 创建一个 5 秒的超时 Promise
            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => {
                    resolve({ status: 'Timeout', message: 'Transaction took too long and timed out' });
                }, 5000);
            });

            // 使用 Promise.race 来在 5 秒后自动返回
            const result = await Promise.race([transactionPromise, timeoutPromise]);
            console.log('FOMO | valid nonce submited');
            console.timeEnd(timerLabel);


            const own_objects = await this._suiMaster._client.getOwnedObjects({
                owner: this._suiMaster.address,
                filter: { StructType: "0x2::coin::Coin<0xa340e3db1332c21f20f5c08bef0fa459e733575f9a7e2f5faca64f72cd5a54f2::fomo::FOMO>" }
            })

            let items = own_objects.data;
            items = items.filter(item => item !== null && item !== '');
            let objectIds = items.map(item => item.data.objectId);
            console.log("当前FOMO代币的对象数：" + objectIds.length);
            if (objectIds.length >= 50) {
                let firstCoinId = objectIds[0];
                let remainingCoinIds = objectIds.slice(1);
                const tx = new suidouble.Transaction();
                tx.mergeCoins(tx.object(firstCoinId), remainingCoinIds.map((item) => tx.object(item)));
                tx.setSender(this._suiMaster.address);
                const transactionPromise2 = this._suiMaster._client.signAndExecuteTransaction({ signer: this._suiMaster._signer, transaction: tx });
                const result = await Promise.race([transactionPromise2, timeoutPromise]);
                console.log(result)
            }
            await new Promise((res)=>setTimeout(res, 1000));

            return true;

            if (r && r.effects && r.effects.status && r.effects.status.status && r.effects.status.status == 'success') {
                console.log('FOMO | valid nonce submited');
                return true;
            } else {
                console.log('FOMO | can not submit nonce');
            }
        } catch (e) {
            console.log('FOMO | can not submit nonce');
            console.error(e);
        }

        return false;
    }

    async waitUntilNextReset(currentReset) {
        const epochLength = 60000;
        const bus = await this.fetchBus();
        const nextReset = Number(bus.fields.last_reset) + epochLength;
        const timeUntilNextReset = nextReset - Date.now();

        if (timeUntilNextReset > 0) {
            await new Promise((res) => setTimeout(res, timeUntilNextReset));
        }

        while (true) {
            const freshBus = await this.fetchBus();
            if (Number(freshBus.fields.last_reset) !== Number(currentReset)) {
                return true;
            } else {
                if (Date.now() > nextReset + 12000) {
                    return false;
                }
                await new Promise((res) => setTimeout(res, 1500));
            }
        }
    }

    prepareHash(currentHash, signerAddressBytes) {
        const prepared = new Uint8Array(32 + 32); // nonce bytes would be empty
        prepared.set(currentHash, 0);
        prepared.set(signerAddressBytes, 32);

        return prepared;
    }

    createHash(currentHash, signerAddressBytes, nonce) {
        const dataToHash = new Uint8Array(32 + 32 + 8);
        dataToHash.set(currentHash, 0);
        dataToHash.set(signerAddressBytes, 32);
        dataToHash.set(u64toBytes(nonce), 64);

        return bigIntTo32Bytes(BigInt('0x' + hasher.keccak256(dataToHash)));
    }

    validateHash(hash, difficulty) {
        return hash.slice(0, difficulty).reduce((a, b) => a + b, 0) === 0;
    }


}