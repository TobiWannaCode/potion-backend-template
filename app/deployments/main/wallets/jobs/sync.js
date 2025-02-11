import _ from "lodash";
import { getApp, parameterTypes } from "../../../../helpers/api";
import { WALLETS } from "../../../../helpers/constants";

const config = {
    type: parameterTypes.none,
    unknownParameters: true,
    connectToDatabase: true,
};

const handler = getApp(async () => {
    console.log(WALLETS);
}, config);

export { handler };
