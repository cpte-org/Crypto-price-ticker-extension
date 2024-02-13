import os
import subprocess
import shutil

# Directory containing the extension source directories
variations_dir = "./variations/"

# Directory to save the signed XPI files
signed_dir = "./Firefox-signed/"

# Mozilla API key and API secret
api_key = "USER-KEY"
api_secret = "API-SECRET"

# Function to sign XPI files
def sign_xpi_files(variations_dir, signed_dir, api_key, api_secret):
    # Check if the signed directory already exists
    if os.path.exists(signed_dir):
        # Move the existing signed directory to an "OLD_Firefox-signed" folder
        old_signed_dir = "./OLD_Firefox-signed/"
        if not os.path.exists(old_signed_dir):
            os.makedirs(old_signed_dir)
        shutil.move(signed_dir, old_signed_dir)

    # Create the directory to save the signed XPI files
    os.makedirs(signed_dir)

    # Iterate through each directory inside variations_dir
    for dir_name in os.listdir(variations_dir):
        source_dir = os.path.join(variations_dir, dir_name)
        if os.path.isdir(source_dir):
            try:
                print(f"Signing extension in directory: {source_dir}...")
                subprocess.run(
                    [
                        "web-ext",
                        "sign",
                        "--api-key",
                        api_key,
                        "--api-secret",
                        api_secret,
                        "--source-dir",
                        source_dir,
                        "--artifacts-dir",
                        signed_dir,
                    ],
                    check=True,
                )
                print(f"Extension in directory {source_dir} signed successfully.")
            except subprocess.CalledProcessError as e:
                print(f"Error signing extension in directory {source_dir}: {e}")
                continue

# Sign XPI files
sign_xpi_files(variations_dir, signed_dir, api_key, api_secret)
