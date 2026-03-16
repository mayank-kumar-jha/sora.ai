
import os

filepath = r'c:\sora\src\services\whatsappService.js'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_next = 0
for i, line in enumerate(lines):
    if 'Critical Initialization Failure' in line:
        # This is one of the bad lines.
        # But wait, I might need to remove the surrounding lines too if they were duplicated.
        continue
    if i > 0 and 'Critical Initialization Failure' in lines[i-1]:
        continue # skip logger.error line
    if i > 0 and i < len(lines)-1 and 'Critical Initialization Failure' in lines[i+1]:
        continue # skip the '}' before catch
    if i > 1 and 'Critical Initialization Failure' in lines[i-2] and 'catch' in lines[i-1]:
         continue # skip the '}' after catch
    
    # Simpler approach: find the specific blocks and remove them
    new_lines.append(line)

# Let's try an even simpler approach: regex or specific string search
content = "".join(lines)
bad_block = """    } catch (err) {
        logger.error('[WhatsApp] Critical Initialization Failure:', err.message);
        // Do not throw, allow server to keep running
    }
};"""

# Wait, the replacement might have been slightly different each time or messed up the closing braces.
# I'll just look for the specific error message and remove the block around it.

import re
# Remove the blocks inserted by the faulty tool call
cleaned = re.sub(r'\s*}\s*catch\s*\(err\)\s*{\s*logger\.error\(\'\[WhatsApp\] Critical Initialization Failure:\',\s*err\.message\);\s*// Do not throw, allow server to keep running\s*}\s*};', '', content)
# Also handle the cases where it didn't have the final };
cleaned = re.sub(r'\s*}\s*catch\s*\(err\)\s*{\s*logger\.error\(\'\[WhatsApp\] Critical Initialization Failure:\',\s*err\.message\);\s*// Do not throw, allow server to keep running\s*}', '', cleaned)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(cleaned)

print("Cleaned up whatsappService.js")
