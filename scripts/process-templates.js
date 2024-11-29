const fs = require("fs").promises;
const path = require("path");

// Set default Bor chain id and allow overriding via command-line arguments
const borChainId = process.argv[2] || "109";

// Convert borChainId to hexadecimal and ensure it's an even-length string
const borChainIdHex = parseInt(borChainId, 10).toString(16).toUpperCase();
const formattedBorChainIdHex = borChainIdHex.length % 2 !== 0 ? `0${borChainIdHex}` : borChainIdHex;

// Recursive function to process all .template files in the directory and its subdirectories
async function processTemplates(directory) {
  try {
    const files = await fs.readdir(directory, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(directory, file.name);

      if (file.isDirectory()) {
        // If it's a directory, recursively process the files within
        await processTemplates(filePath);
      } else if (file.name.endsWith(".template")) {
        // If it's a .template file, process it
        const templateString = await fs.readFile(filePath, "utf-8");

        // Replace placeholders with actual values
        const resultString = templateString
          .replace(/{{\s*borChainId\s*}}/g, borChainId)
          .replace(/{{\s*borChainIdHex\s*}}/g, formattedBorChainIdHex);

        // Write the processed content to the new file (without ".template" extension)
        const outputPath = filePath.replace(".template", "");
        await fs.writeFile(outputPath, resultString);
        
        console.log(`Processed: ${outputPath}`);
      }
    }
  } catch (err) {
    console.error("Error processing files:", err);
  }
}

// Start processing from the root directory (parent folder)
const rootDirectory = path.join(__dirname, "..");
processTemplates(rootDirectory).then(() => {
  console.log("All template files have been processed.");
});
