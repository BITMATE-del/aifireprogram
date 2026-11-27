FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py login_flow.py session_file_import.py test_session_file_import.py account_management.py ./
RUN python -m py_compile worker.py login_flow.py session_file_import.py test_session_file_import.py account_management.py && python test_session_file_import.py
RUN useradd --create-home --uid 10001 moment
USER moment
CMD ["python", "worker.py"]
