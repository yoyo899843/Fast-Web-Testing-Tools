import subprocess
import sys
import time

start_time = time.time()

try:
    with open("url.txt", "r") as f:
        url_list = [line.strip() for line in f if line.strip()]
except FileNotFoundError:
    sys.exit("url.txt not found. Create it with one target URL per line, then re-run.")

if not url_list:
    sys.exit("url.txt is empty. Add at least one target URL (one per line).")

def check_dirsearch():

    log = "dirsearch_log" + str(int(start_time)) + ".txt"

    with open(log, "w") as write_log:
        for url in url_list:
            print(f"[*] Scanning {url} ...")
            write_log.write(f"===== {url} =====\n")
            write_log.flush()

            result = subprocess.run(
                ["dirsearch", "-u", url, "-x 500,403"],
                capture_output=True, text=True,
            )

            write_log.write(result.stdout)
            if result.stderr:
                write_log.write("\n[stderr]\n")
                write_log.write(result.stderr)
            write_log.write("\n\n")
            write_log.flush()

            if result.returncode != 0:
                print(f"[!] dirsearch exited with code {result.returncode} for {url}")

def check_gitleak():

    log = "gitleak_log" + str(int(start_time)) + ".txt"

    with open(log, "w") as write_log:
        for url in url_list:
            print(f"[*] Scanning {url} ...")
            write_log.write(f"===== {url} =====\n")
            write_log.flush()

            result = subprocess.run(
                ["gitleaks", "detect", "-s", url],
                capture_output=True, text=True,
            )

            write_log.write(result.stdout)
            if result.stderr:
                write_log.write("\n[stderr]\n")
                write_log.write(result.stderr)
            write_log.write("\n\n")
            write_log.flush()

            if result.returncode != 0:
                print(f"[!] gitleaks exited with code {result.returncode} for {url}")

elapsed = time.time() - start_time
print(f"Done. {len(url_list)} target(s) scanned in {elapsed:.1f}s. See {log} for details.")
