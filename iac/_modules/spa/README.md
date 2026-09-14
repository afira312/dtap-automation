<!-- BEGIN_TF_DOCS -->
## Overview

This module provisions the Azure resources required by the static SPA:

- A resource group, App Service plan, and Linux App Service.
- One application storage account with a private container named `release`.
- A `Storage Blob Data Contributor` role assignment for the current
  deployment identity on the `release` container.

The App Service exposes the Terraform environment through the `myEnvironment`
application setting. The module accepts only `dev` and `prod` environments.

## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.15.8, < 2.0.0 |
| <a name="requirement_azapi"></a> [azapi](#requirement\_azapi) | ~> 2.11 |
| <a name="requirement_azurerm"></a> [azurerm](#requirement\_azurerm) | ~> 4.0 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_azurerm"></a> [azurerm](#provider\_azurerm) | ~> 4.0 |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| <a name="module_app"></a> [app](#module\_app) | Azure/avm-res-web-site/azurerm | 0.22.0 |
| <a name="module_asp"></a> [asp](#module\_asp) | Azure/avm-res-web-serverfarm/azurerm | 2.0.8 |
| <a name="module_storage"></a> [storage](#module\_storage) | Azure/avm-res-storage-storageaccount/azurerm | 0.10.0 |

## Resources

| Name | Type |
| ---- | ---- |
| [azurerm_resource_group.this](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/resource_group) | resource |
| [azurerm_client_config.current](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/data-sources/client_config) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_asp_sku_name"></a> [asp\_sku\_name](#input\_asp\_sku\_name) | App service plan SKU name. B1-3, S1-10, P*, Y1, F1 | `string` | `"B1"` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | The environment for the resources. | `string` | `"dev"` | no |
| <a name="input_location"></a> [location](#input\_location) | The location where the resource group will be created. | `string` | n/a | yes |
| <a name="input_resourcePrefix"></a> [resourcePrefix](#input\_resourcePrefix) | This string will be used for all resource namings. <pre>-rg, <pre>-asp, <pre>-app | `string` | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | A map of tags to assign to the resources. | `map(string)` | `{}` | no |

## Outputs

No outputs.
<!-- END_TF_DOCS -->