output "asp_id" {
  value       = module.asp.resource_id
  description = "App Service Plan Id"
}

output "resource_group_name" {
  value       = azurerm_resource_group.this.name
  description = "Resource Group Name"
}

output "resource_group_id" {
  value       = azurerm_resource_group.this.id
  description = "Resource Group ID"
}

