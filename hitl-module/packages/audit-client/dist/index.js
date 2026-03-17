export function createAuditClient(service) {
    return {
        emit(event) {
            return { accepted: true, service, event };
        }
    };
}
//# sourceMappingURL=index.js.map