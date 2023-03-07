Project Title
=============

Collateral Networks and User Credits Payment Update Script

Description
-----------

This script updates all payments for collateral networks and user credits. It also generates log files in the logs folder. To use this script, follow the instructions below.

Installation
------------

1.  Clone this repository to your local machine.
2.  Create a `.env` file and fill it with the variables found in `.env.example`. You will need an API Key from "etherscan" and "bscscan".
3.  Install all dependencies by running `npm install` or `yarn`.

Usage
-----

To run the script, use the command `node index.js`. This will update the database and generate log files in the logs folder.

If you don't want to update the database and simply simulate what would happen and check the results in logs folder, you can run the script as follows:

`node index.js test`

Credits
-------

This project was created by Hich.eth
