FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 python3-pip rocksdb-tools && \
    rm -rf /var/lib/apt/lists/*

# rocksdb-tools provides ldb on Ubuntu
RUN which ldb || ln -sf /usr/bin/rocksdb_ldb /usr/local/bin/ldb 2>/dev/null; \
    which rocksdb_ldb || ln -sf /usr/bin/ldb /usr/local/bin/rocksdb_ldb 2>/dev/null; \
    true

WORKDIR /app
COPY sidecar.py .

ENV LDB_BIN=ldb
EXPOSE 8081
CMD ["python3", "-u", "sidecar.py"]
