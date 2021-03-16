import os
import shutil
from git import Repo
from datetime import datetime

#JS minify
from slimit import minify
import requests

#ZipFile
from os.path import basename
from zipfile import ZipFile

#To Delete
import time



#Coins names
coinName = ["ethereum","ethereum-classic","bitcoin-cash","bitcoin-cash-sv","bitcoin","litecoin","zcash","neo","cardano","monero"]
coinSuffix = ["ETH","ETC","BCH","BSV","BTC","LTC","ZEC","NEO","ADA","XMR"]

#DIR
logoGit="https://gitlab.com/nfl0/crypto-logos.git"
donorDir="./src-donor/"
clonesDir="./variations/"
buildDir="./build/"
#to-do: Files to clone and vars to be replaced


#Make Variaties dir
if os.path.exists(clonesDir):
	dest = shutil.move(clonesDir, "OLD_"+clonesDir+"_"+datetime.now().strftime("%m%d%Y, %H%M%S")+"_OLD")
	print("[info] - Old 'variation' Dir Archived!")
print("[info] - Clonning "+logoGit)
Repo.clone_from(logoGit, clonesDir)

#Make Builds dir
if os.path.exists(buildDir):
	dest = shutil.move(buildDir, "OLD_"+buildDir+"_"+datetime.now().strftime("%m%d%Y, %H%M%S")+"_OLD")
	print("[info] - Old 'build' Dir Archived!")
print("[info] - Generating "+buildDir+" tree")
os.mkdir(buildDir)
os.mkdir(buildDir+"minified/")
os.mkdir(buildDir+"unMinified/")


#modify and move background.js and manifest.json
for num, folder in enumerate(coinSuffix, start=0):
	coinFolder=clonesDir+folder+"/"
	if os.path.exists(coinFolder):

		#input files
		#loop through available files in ./src-donor
		jsIn = open(donorDir+"background.js", "rt")
		jsonIn = open(donorDir+"manifest.json", "rt")

			#output files to write the result to
		jsOut = open(coinFolder+"background.js", "wt")
		jsonOut = open(coinFolder+"manifest.json", "wt")

			#for each line in the first input file
		for line in jsIn:
			#read replace the string and write to output file
			jsOut.write(line.replace("bitcoin", coinName[num]))

			#for each line in the second input file
		for line1 in jsonIn:
			#read replace the string and write to output file
			line1=line1.replace("Bitcoin", coinName[num].replace("-", " ").title())
			line1=line1.replace("2.0.3", "2.0.4")
			jsonOut.write(line1)
			
		#close input and output files
		jsIn.close()
		jsOut.close()
		jsonIn.close()
		jsonOut.close()
		
		# Zip the files from given directory that matches the filter
		def zipFilesInDir(dirName, zipFileName, filter):
			# create a ZipFile object
			with ZipFile(zipFileName, 'w') as zipObj:
				# Iterate over all the files in directory
				for folderName, subfolders, filenames in os.walk(dirName):
					for filename in filenames:
						if filter(filename):
							# create complete filepath of file in directory
							filePath = os.path.join(folderName, filename)
							# Add file to zip
							zipObj.write(filePath, basename(filePath))

		#generate unMinified zip
		zipFilesInDir(coinFolder, buildDir+"unMinified/"+coinName[num].replace("-", "_")+"-full.zip", lambda name : "js" in name or "png" in name)
		
		#Minify background.js


		url = 'https://javascript-minifier.com/raw'
		data = {'input': open(coinFolder+"background.js", 'rb').read()}
		response = requests.post(url, data=data)

		
		jsOut = open(coinFolder+"background.js", "wt")
		jsOut.write(response.text)
		jsOut.close()
		
		#generate minified zip
		zipFilesInDir(coinFolder, buildDir+"minified/"+coinName[num].replace("-", "_")+".zip", lambda name : "js" in name or "png" in name)
		
		
		
		print("[info] - Done {}/{}".format(num+1, len(coinSuffix)))
		time.sleep(0.2)

		

