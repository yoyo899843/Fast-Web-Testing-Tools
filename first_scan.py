import os
import re
import subprocess
import sys
import time

import requests

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
                ["dirsearch", "-u", url, "-x", "500,403"],
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

    return log

def is_git_exposed(url):
    head_url = url.rstrip("/") + "/.git/HEAD"
    try:
        resp = requests.get(head_url, timeout=10)
    except requests.RequestException:
        return False
    return resp.status_code == 200 and resp.text.strip().startswith("ref:")

def dump_git(url, dest_dir):
    git_url = url.rstrip("/") + "/.git/"
    return subprocess.run(
        ["git-dumper", git_url, dest_dir],
        capture_output=True, text=True,
    )

def check_gitleak():

    log = "gitleak_log" + str(int(start_time)) + ".txt"
    dumps_dir = "git_dumps_" + str(int(start_time))

    with open(log, "w") as write_log:
        for url in url_list:
            print(f"[*] Checking {url} for exposed .git ...")
            write_log.write(f"===== {url} =====\n")
            write_log.flush()

            if not is_git_exposed(url):
                print(f"[-] No exposed .git directory at {url}")
                write_log.write("[-] No exposed .git directory found, skipped.\n\n")
                write_log.flush()
                continue

            print(f"[+] Exposed .git found at {url}, dumping ...")
            dest_dir = os.path.join(dumps_dir, re.sub(r"[^\w.-]", "_", url))

            dump_result = dump_git(url, dest_dir)
            write_log.write("[git-dumper output]\n")
            write_log.write(dump_result.stdout)
            if dump_result.stderr:
                write_log.write("\n[git-dumper stderr]\n")
                write_log.write(dump_result.stderr)
            write_log.flush()

            if dump_result.returncode != 0:
                print(f"[!] git-dumper exited with code {dump_result.returncode} for {url}")
                write_log.write("\n\n")
                write_log.flush()
                continue

            result = subprocess.run(
                ["gitleaks", "detect", "-s", dest_dir],
                capture_output=True, text=True,
            )

            write_log.write("\n[gitleaks output]\n")
            write_log.write(result.stdout)
            if result.stderr:
                write_log.write("\n[stderr]\n")
                write_log.write(result.stderr)
            write_log.write("\n\n")
            write_log.flush()

            if result.returncode == 1:
                print(f"[+] Potential leaks found for {url} — see {log}")
            elif result.returncode != 0:
                print(f"[!] gitleaks exited with code {result.returncode} for {url}")

    return log

dirsearch_log = check_dirsearch()
gitleak_log = check_gitleak()

elapsed = time.time() - start_time
print(f"Done. {len(url_list)} target(s) scanned in {elapsed:.1f}s. See {dirsearch_log} and {gitleak_log} for details.")
