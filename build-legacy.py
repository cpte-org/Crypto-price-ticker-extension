import os
import shutil
from git import Repo
from datetime import datetime
import requests
from os.path import basename
from zipfile import ZipFile
import time

# Coin data
coins = [
    {"name": "ethereum", "api_name": "ethereum", "suffix": "ETH"},
    {"name": "ethereum-classic", "api_name": "ethereum-classic", "suffix": "ETC"},
    {"name": "bitcoin-cash", "api_name": "bitcoin-cash", "suffix": "BCH"},
    {"name": "bitcoin-cash-sv", "api_name": "bitcoin-cash-sv", "suffix": "BSV"},
    {"name": "bitcoin", "api_name": "bitcoin", "suffix": "BTC"},
    {"name": "litecoin", "api_name": "litecoin", "suffix": "LTC"},
    {"name": "zcash", "api_name": "zcash", "suffix": "ZEC"},
    {"name": "neo", "api_name": "neo", "suffix": "NEO"},
    {"name": "cardano", "api_name": "cardano", "suffix": "ADA"},
    {"name": "monero", "api_name": "monero", "suffix": "XMR"},
    {"name": "thorchain", "api_name": "thorchain", "suffix": "RUNE"},
    {"name": "dogecoin", "api_name": "dogecoin", "suffix": "DOGE"},
    {"name": "haven", "api_name": "haven", "suffix": "XHV"},
    {"name": "ethereum-name-service", "api_name": "ethereum-name-service", "suffix": "ENS"},
    {"name": "terra-luna", "api_name": "terra-luna", "suffix": "LUNA"},
    {"name": "solana", "api_name": "solana", "suffix": "SOL"},
    {"name": "fantom", "api_name": "fantom", "suffix": "FTM"},
    {"name": "polkadot", "api_name": "polkadot", "suffix": "POL"},
    {"name": "avalanche", "api_name": "avalanche-2", "suffix": "AVA"},
    {"name": "polygon", "api_name": "matic-network", "suffix": "MATIC"},
    {"name": "cosmos", "api_name": "cosmos", "suffix": "ATOM"},
    {"name": "tezos", "api_name": "tezos", "suffix": "XTZ"},
    {"name": "kusama", "api_name": "kusama", "suffix": "KSM"},
    {"name": "kadena", "api_name": "kadena", "suffix": "KDA"},
    {"name": "moonriver", "api_name": "moonriver", "suffix": "MOVR"}
]

# Directories
logoGit = "https://gitlab.com/nfl0/crypto-logos.git"
donorDir = "./src-donor/"
clonesDir = "./variations/"
buildDir = "./build/"

def zip_files_in_directory(dir_name, zip_file_name, filter_function):
    """Zip files in a directory."""
    with ZipFile(zip_file_name, 'w') as zip_obj:
        for folder_name, subfolders, filenames in os.walk(dir_name):
            for filename in filenames:
                if filter_function(filename):
                    file_path = os.path.join(folder_name, filename)
                    zip_obj.write(file_path, basename(file_path))

# Verbose messages
print("[INFO] - Script started.")
print("[INFO] - Coin data loaded.")
print("[INFO] - Cloning logos repository...")
try:
    Repo.clone_from(logoGit, clonesDir)
    print("[INFO] - Logos repository cloned successfully.")
except Exception as e:
    print(f"[ERROR] - Failed to clone logos repository: {e}")
    while True:
        remove_variations = input("Do you want to remove the 'variations' directory? (yes/no): ").lower()
        if remove_variations == "yes":
            shutil.rmtree(clonesDir)
            print("[INFO] - 'variations' directory removed.")
            try:
                Repo.clone_from(logoGit, clonesDir)
                print("[INFO] - Logos repository re-cloned successfully.")
                break
            except Exception as e:
                print(f"[ERROR] - Failed to clone logos repository: {e}")
                continue
        elif remove_variations == "no":
            print("[INFO] - Exiting script.")
            exit(1)
        else:
            print("Invalid input. Please enter 'yes' or 'no'.")
            print("[INFO] - Exiting script.")
            exit(1)

print("[INFO] - Creating necessary directories...")
if os.path.exists(buildDir):
    shutil.move(buildDir, "OLD_" + buildDir + "_" + datetime.now().strftime("%m%d%Y, %H%M%S") + "_OLD")
try:
    os.makedirs(buildDir + "minified/")
    os.makedirs(buildDir + "unMinified/")
    print("[INFO] - Directories created successfully.")
except Exception as e:
    print(f"[ERROR] - Failed to create directories: {e}")
    print("[INFO] - Reverting changes...")
    if os.path.exists(clonesDir):
        shutil.rmtree(clonesDir)
    exit(1)

# Process each coin
for index, coin in enumerate(coins, start=1):
    coin_folder = clonesDir + coin['suffix'] + "/"
    if os.path.exists(coin_folder):
        print(f"[INFO] - Processing coin {index}/{len(coins)}: {coin['name']}...")
        
        # Read input files
        try:
            with open(donorDir + "background.js", "rt") as js_in:
                with open(donorDir + "manifest.json", "rt") as json_in:
                    
                    # Write output files
                    with open(coin_folder + "background.js", "wt") as js_out:
                        with open(coin_folder + "manifest.json", "wt") as json_out:
                            
                            # Modify files
                            for line in js_in:
                                js_out.write(line.replace("bitcoin", coin['api_name']))

                            for line in json_in:
                                line = line.replace("Bitcoin", coin['name'].replace("-", " ").title())
                                line = line.replace("0.0.0", "3.0.0")
                                json_out.write(line)
        except Exception as e:
            print(f"[ERROR] - Failed to process coin {coin['name']}: {e}")
            print("[INFO] - Reverting changes...")
            if os.path.exists(clonesDir):
                shutil.rmtree(clonesDir)
            if os.path.exists(buildDir):
                shutil.rmtree(buildDir)
            exit(1)
        
        # Zip unMinified files
        try:
            zip_files_in_directory(coin_folder, buildDir + "unMinified/" + coin['name'].replace("-", "_") + "-full.zip",
                                    lambda name: "js" in name or "png" in name)
        except Exception as e:
            print(f"[ERROR] - Failed to zip unMinified files for coin {coin['name']}: {e}")
            print("[INFO] - Reverting changes...")
            if os.path.exists(clonesDir):
                shutil.rmtree(clonesDir)
            if os.path.exists(buildDir):
                shutil.rmtree(buildDir)
            exit(1)

        # Minify background.js
        try:
            url = 'https://www.toptal.com/developers/javascript-minifier/api/raw'
            data = {'input': open(coin_folder + "background.js", 'rb').read()}
            response = requests.post(url, data=data).text

            # Write minified background.js
            with open(coin_folder + "background.js", "wt") as js_out:
                js_out.write(response)
        except Exception as e:
            print(f"[ERROR] - Failed to minify background.js for coin {coin['name']}: {e}")
            print("[INFO] - Reverting changes...")
            if os.path.exists(clonesDir):
                shutil.rmtree(clonesDir)
            exit(1)

        # Zip minified files
        try:
            zip_files_in_directory(coin_folder, buildDir + "minified/" + coin['name'].replace("-", "_") + ".zip",
                                    lambda name: "js" in name or "png" in name)
            print(f"[INFO] - Coin {coin['name']} processed successfully.")
        except Exception as e:
            print(f"[ERROR] - Failed to zip minified files for coin {coin['name']}: {e}")
            print("[INFO] - Reverting changes...")
            if os.path.exists(clonesDir):
                shutil.rmtree(clonesDir)
            if os.path.exists(buildDir):
                shutil.rmtree(buildDir)
            exit(1)

        time.sleep(0.2)

print("[INFO] - Script completed.")
